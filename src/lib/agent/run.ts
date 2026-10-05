import "server-only";
import OpenAI from "openai";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import { clinic } from "../clinic-config";
import { dashboardLink, notifyCoordinator } from "../notify";
import type { Store } from "../store";
import type { ConversationPatch } from "../store/types";
import type { ApiMessage, Conversation, Stage } from "../types";
import { SYSTEM_PROMPT } from "./prompt";
import { handoffInput, TOOLS, updateLeadInput } from "./tools";

// Any OpenAI-compatible endpoint works. Defaults to NVIDIA's free NIM API.
//   NVIDIA:     https://integrate.api.nvidia.com/v1   meta/llama-3.3-70b-instruct
//   Groq:       https://api.groq.com/openai/v1        llama-3.3-70b-versatile
//   Gemini:     https://generativelanguage.googleapis.com/v1beta/openai/   gemini-2.5-flash
//   OpenRouter: https://openrouter.ai/api/v1          (any model with tool support)
const BASE_URL = process.env.LLM_BASE_URL || "https://integrate.api.nvidia.com/v1";
export const MODEL = process.env.LLM_MODEL || "meta/llama-3.3-70b-instruct";
const MAX_TOOL_ROUNDS = 4;

// The subset of the SDK we use, so tests can pass a fake client.
export type ChatClient = {
  chat: { completions: { create: OpenAI["chat"]["completions"]["create"] } };
};

let defaultClient: OpenAI | undefined;
const getClient = () =>
  (defaultClient ??= new OpenAI({ baseURL: BASE_URL, apiKey: process.env.LLM_API_KEY, maxRetries: 2 }));

export const FALLBACK_REPLY =
  "Sorry, I couldn't answer that just now. Our coordinator will get back to you shortly.";

type TurnResult = { reply: string; handedOff: boolean };

// One turn at a time per conversation: two concurrent turns would both build on
// the same history and append interleaved entries. (Per-process only — run a
// single instance or move this to a DB advisory lock when scaling out.)
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}

export function runAgentTurn(
  store: Store,
  conversationId: string,
  patientText: string,
  client: ChatClient = getClient(),
): Promise<TurnResult> {
  return withLock(conversationId, () => runTurnLocked(store, conversationId, patientText, client));
}

async function runTurnLocked(
  store: Store,
  conversationId: string,
  patientText: string,
  client: ChatClient,
): Promise<TurnResult> {
  const conversation = await store.getConversation(conversationId);
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

  // Fold in anything the coordinator wrote while the AI was paused.
  const staffMessages = await store.listUnsyncedStaffMessages(conversationId);
  const staffNotes = staffMessages.map(
    (m) => `[Coordinator ${clinic.coordinatorName} wrote to the patient: "${m.text}"]`,
  );

  const turn: ApiMessage[] = [{ role: "user", content: [...staffNotes, patientText].join("\n\n") }];
  const replyParts: string[] = [];
  const effects = new TurnEffects(conversation);

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...conversation.apiHistory, ...turn],
        tools: TOOLS,
        tool_choice: round < MAX_TOOL_ROUNDS ? "auto" : "none",
        temperature: 0.4,
        max_tokens: 1024,
      });

      const choice = response.choices[0];
      if (!choice) throw new Error("Empty response from model");
      const message = choice.message;
      const toolCalls = (message.tool_calls ?? []).filter(
        (c): c is ChatCompletionMessageFunctionToolCall => c.type === "function",
      );

      turn.push({
        role: "assistant",
        content: message.content ?? null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });

      const text = cleanReply(message.content);
      if (text) replyParts.push(text);

      if (choice.finish_reason === "content_filter") {
        replyParts.length = 0;
        replyParts.push(FALLBACK_REPLY);
        effects.handoff("The AI provider blocked a reply to this message.", "normal");
        break;
      }

      // Some providers report finish_reason "stop" even with tool calls, so key off the calls.
      if (toolCalls.length === 0) break;

      for (const call of toolCalls) {
        const result: ChatCompletionToolMessageParam = {
          role: "tool",
          tool_call_id: call.id,
          content: effects.apply(call.function.name, call.function.arguments),
        };
        turn.push(result);
      }
    }
  } catch (err) {
    // Nothing is appended on failure: the history stays consistent and the staff
    // messages stay unsynced, so the next turn includes them again.
    console.error("[agent] turn failed", err);
    // The fallback reply promises a human follow-up, so make sure one happens.
    const reason = "The AI assistant was unavailable for this message.";
    await store.updateConversation(conversationId, {
      unreadForStaff: true,
      handoffReason: reason,
      ...(canMoveTo(conversation.stage, "handoff") ? { stage: "handoff" as const } : {}),
    });
    await notifyCoordinator(`⚠️ ${reason}\n${describe(conversation)}\n${dashboardLink(conversationId)}`);
    return { reply: FALLBACK_REPLY, handedOff: true };
  }

  await store.appendApiHistory(conversationId, turn);
  await store.markStaffMessagesSynced(staffMessages.map((m) => m.id));
  await effects.commit(store);

  return { reply: replyParts.join("\n\n") || FALLBACK_REPLY, handedOff: effects.handedOff };
}

// Reasoning models (Qwen, DeepSeek…) may leak <think> blocks into the content.
function cleanReply(content: string | null | undefined): string {
  return (content ?? "").replace(/<think>[\s\S]*?(<\/think>|$)/gi, "").trim();
}

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

// Collects the lead updates and alerts produced by tool calls in one turn and
// applies them together at the end.
class TurnEffects {
  private patch: ConversationPatch = {};
  private alerts: string[] = [];
  handedOff = false;

  constructor(private readonly before: Conversation) {
    if (before.stage === "new") this.patch.stage = "qualifying";
  }

  private get current(): Conversation {
    return { ...this.before, ...this.patch } as Conversation;
  }

  apply(name: string, rawArgs: string): string {
    const args = parseArgs(rawArgs);
    if (name === "update_lead") {
      const parsed = updateLeadInput.safeParse(args);
      if (!parsed.success) return `Error: invalid input (${parsed.error.issues[0]?.message}). Fix and retry.`;
      this.updateLead(parsed.data);
      return "Saved.";
    }
    if (name === "handoff_to_coordinator") {
      const parsed = handoffInput.safeParse(args);
      if (!parsed.success) return `Error: invalid input (${parsed.error.issues[0]?.message}). Fix and retry.`;
      this.handoff(parsed.data.reason, parsed.data.urgency);
      return `${clinic.coordinatorName} has been notified.`;
    }
    return `Error: unknown tool ${name}.`;
  }

  private updateLead(input: ReturnType<typeof updateLeadInput.parse>) {
    const had = this.current;
    const fields = {
      name: input.name,
      country: input.country,
      language: input.language,
      treatment: input.treatment,
      timeframe: input.timeframe,
      budget: input.budget,
      whatsapp: input.whatsapp,
      email: input.email,
      medicalNotes: input.medical_notes,
      summary: input.summary,
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value) (this.patch as Record<string, unknown>)[key] = value;
    }
    if (input.score !== null) this.patch.score = input.score;
    if (input.stage !== "unchanged" && canMoveTo(had.stage, input.stage)) this.patch.stage = input.stage;

    const now = this.current;
    if (!had.whatsapp && !had.email && (now.whatsapp || now.email)) {
      this.alerts.push(`📇 New contact: ${describe(now)}`);
    }
    if (had.score < 70 && now.score >= 70) {
      this.alerts.push(`🔥 Hot lead (score ${now.score}): ${describe(now)}`);
    }
  }

  handoff(reason: string, urgency: "normal" | "high") {
    this.handedOff = true;
    this.patch.handoffReason = reason;
    if (canMoveTo(this.current.stage, "handoff")) this.patch.stage = "handoff";
    this.alerts.push(`${urgency === "high" ? "🚨" : "🙋"} Handoff — ${reason}\n${describe(this.current)}`);
  }

  async commit(store: Store) {
    await store.updateConversation(this.before.id, { ...this.patch, unreadForStaff: true });
    for (const alert of this.alerts) {
      await notifyCoordinator(`${alert}\n${dashboardLink(this.before.id)}`);
    }
  }
}

// The AI may move a lead forward or mark it lost, but never undo a handoff or booking.
export function canMoveTo(from: Stage, to: Stage): boolean {
  if (from === to) return false;
  if (from === "booked") return false;
  if (from === "handoff") return to === "booked" || to === "lost";
  if (to === "lost") return true;
  const order: Stage[] = ["new", "qualifying", "qualified", "handoff", "booked"];
  return order.indexOf(to) > order.indexOf(from);
}

function describe(c: Conversation): string {
  return [c.name ?? "Unknown", c.country, c.treatment, c.timeframe, c.whatsapp ?? c.email]
    .filter(Boolean)
    .join(" · ");
}
