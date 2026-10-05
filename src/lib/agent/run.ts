import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { clinic } from "../clinic-config";
import { dashboardLink, notifyCoordinator } from "../notify";
import type { Store } from "../store";
import type { ConversationPatch } from "../store/types";
import type { ApiMessage, Conversation, Stage } from "../types";
import { SYSTEM_PROMPT } from "./prompt";
import { handoffInput, TOOLS, updateLeadInput } from "./tools";

export const MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 4;

// The subset of the SDK we use, so tests can pass a fake client.
export type MessagesClient = {
  beta: { messages: { create: Anthropic["beta"]["messages"]["create"] } };
};

let defaultClient: Anthropic | undefined;
const getClient = () => (defaultClient ??= new Anthropic());

const FALLBACK_REPLY =
  "Sorry, I couldn't answer that just now. Our coordinator will get back to you shortly.";

type TurnResult = { reply: string; handedOff: boolean };

// One turn at a time per conversation: two concurrent turns would both build on
// the same history and append interleaved, invalid entries. (Per-process only —
// run a single instance or move this to a DB advisory lock when scaling out.)
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
  client: MessagesClient = getClient(),
): Promise<TurnResult> {
  return withLock(conversationId, () => runTurnLocked(store, conversationId, patientText, client));
}

async function runTurnLocked(
  store: Store,
  conversationId: string,
  patientText: string,
  client: MessagesClient,
): Promise<TurnResult> {
  const conversation = await store.getConversation(conversationId);
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

  // Fold in anything the coordinator wrote while the AI was paused.
  const staffMessages = await store.listUnsyncedStaffMessages(conversationId);
  const userContent: Anthropic.Beta.BetaContentBlockParam[] = [
    ...staffMessages.map((m) => ({
      type: "text" as const,
      text: `[Coordinator ${clinic.coordinatorName} wrote to the patient: "${m.text}"]`,
    })),
    { type: "text", text: patientText },
  ];

  const turn: ApiMessage[] = [{ role: "user", content: userContent }];
  const replyParts: string[] = [];
  const effects = new TurnEffects(conversation);

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        // Caches the conversation so far; each turn only pays for the new part.
        cache_control: { type: "ephemeral" },
        messages: [...conversation.apiHistory, ...turn],
        // Chat needs speed more than deep reasoning.
        output_config: { effort: "low" },
        // If the model declines, the API retries on a fallback model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      // Append the assistant content unchanged — required for the next request.
      turn.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) replyParts.push(block.text.trim());
      }

      if (response.stop_reason === "refusal") {
        replyParts.length = 0;
        replyParts.push(FALLBACK_REPLY);
        effects.handoff("The assistant could not answer this message.", "normal");
        break;
      }

      if (response.stop_reason !== "tool_use") break;

      const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        toolResults.push({ type: "tool_result", tool_use_id: block.id, ...effects.apply(block) });
      }
      // Tool results are always appended, even if we stop here, so the history
      // never ends on an unanswered tool_use.
      turn.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    // Nothing is appended on failure: the AI history stays consistent and the
    // staff messages stay unsynced, so the next turn includes them again.
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

  apply(block: Anthropic.Beta.BetaToolUseBlock): { content: string; is_error?: boolean } {
    if (block.name === "update_lead") {
      const parsed = updateLeadInput.safeParse(block.input);
      if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, is_error: true };
      this.updateLead(parsed.data);
      return { content: "Saved." };
    }
    if (block.name === "handoff_to_coordinator") {
      const parsed = handoffInput.safeParse(block.input);
      if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, is_error: true };
      this.handoff(parsed.data.reason, parsed.data.urgency);
      return { content: `${clinic.coordinatorName} has been notified.` };
    }
    return { content: `Unknown tool: ${block.name}`, is_error: true };
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
function canMoveTo(from: Stage, to: Stage): boolean {
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
