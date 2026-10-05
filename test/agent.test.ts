import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentTurn, type MessagesClient } from "@/lib/agent/run";
import { notifyCoordinator } from "@/lib/notify";
import { memoryStore as store } from "@/lib/store/memory";

vi.mock("@/lib/notify", () => ({
  notifyCoordinator: vi.fn(async () => {}),
  dashboardLink: (id: string) => `http://test/dashboard/leads/${id}`,
}));

type FakeResponse = Pick<Anthropic.Beta.BetaMessage, "content" | "stop_reason">;
type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;

function fakeClient(responses: (FakeResponse | Error)[]) {
  const calls: CreateParams[] = [];
  const client = {
    beta: {
      messages: {
        create: vi.fn(async (params: CreateParams) => {
          // Snapshot: the agent keeps mutating its turn array after the call.
          calls.push(structuredClone(params));
          const next = responses.shift();
          if (!next) throw new Error("unexpected extra API call");
          if (next instanceof Error) throw next;
          return next;
        }),
      },
    },
  } as unknown as MessagesClient;
  return { client, calls };
}

const text = (t: string) => ({ type: "text", text: t, citations: null }) as Anthropic.Beta.BetaTextBlock;
const toolUse = (id: string, name: string, input: unknown) =>
  ({ type: "tool_use", id, name, input }) as Anthropic.Beta.BetaToolUseBlock;

const leadInput = (overrides: Record<string, unknown> = {}) => ({
  name: null,
  country: null,
  language: null,
  treatment: null,
  timeframe: null,
  budget: null,
  whatsapp: null,
  email: null,
  medical_notes: null,
  summary: null,
  stage: "unchanged",
  score: null,
  ...overrides,
});

describe("runAgentTurn", () => {
  let conversationId: string;
  beforeEach(async () => {
    conversationId = (await store.createConversation()).id;
  });

  it("runs tools, records the lead and appends the full turn to history", async () => {
    const { client, calls } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [
          toolUse("t1", "update_lead", leadInput({
            name: "Anna",
            country: "Germany",
            treatment: "FUE hair transplant",
            whatsapp: "+49 151 234567",
            stage: "qualified",
            score: 80,
          })),
          toolUse("t2", "handoff_to_coordinator", { reason: "Wants to book in March", urgency: "high" }),
        ],
      },
      { stop_reason: "end_turn", content: [text("Danke Anna! Elif meldet sich gleich bei Ihnen.")] },
    ]);

    const result = await runAgentTurn(store, conversationId, "Ich möchte im März kommen", client);

    expect(result.reply).toBe("Danke Anna! Elif meldet sich gleich bei Ihnen.");
    expect(result.handedOff).toBe(true);

    const lead = await store.getConversation(conversationId);
    expect(lead).toMatchObject({
      name: "Anna",
      country: "Germany",
      whatsapp: "+49 151 234567",
      score: 80,
      stage: "handoff", // handoff wins over the model's "qualified"
      handoffReason: "Wants to book in March",
      unreadForStaff: true,
    });

    // user → assistant(tool_use) → user(tool_results) → assistant(text)
    expect(lead!.apiHistory.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    const toolResults = lead!.apiHistory[2].content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(toolResults.map((r) => r.tool_use_id)).toEqual(["t1", "t2"]);

    // Second request carried the first assistant turn back unchanged.
    expect(calls[0].messages).toHaveLength(1);
    expect(calls[1].messages[1].content).toEqual(lead!.apiHistory[1].content);
    expect(calls[0].fallbacks).toBe("default");
  });

  it("builds on the existing history on the next turn", async () => {
    const first = fakeClient([{ stop_reason: "end_turn", content: [text("Hello!")] }]);
    await runAgentTurn(store, conversationId, "Hi", first.client);
    const second = fakeClient([{ stop_reason: "end_turn", content: [text("Sure.")] }]);
    await runAgentTurn(store, conversationId, "Prices?", second.client);

    expect(second.calls[0].messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect((await store.getConversation(conversationId))!.apiHistory).toHaveLength(4);
  });

  it("leaves history and staff messages untouched when the API fails", async () => {
    await store.addMessage(conversationId, "staff", "Hi, this is Elif.");
    const { client } = fakeClient([new Error("overloaded")]);

    const result = await runAgentTurn(store, conversationId, "Hello?", client);

    expect(result.reply).toMatch(/coordinator/i);
    const lead = (await store.getConversation(conversationId))!;
    expect(lead.apiHistory).toHaveLength(0);
    expect(await store.listUnsyncedStaffMessages(conversationId)).toHaveLength(1);
    // The reply promises a human follow-up, so staff must be alerted.
    expect(lead).toMatchObject({ stage: "handoff", unreadForStaff: true });
    expect(notifyCoordinator).toHaveBeenCalledWith(expect.stringContaining("unavailable"));
  });

  it("folds unsynced coordinator messages into the next user turn", async () => {
    await store.addMessage(conversationId, "staff", "Your quote is ready.");
    const { client, calls } = fakeClient([{ stop_reason: "end_turn", content: [text("Great!")] }]);

    await runAgentTurn(store, conversationId, "Thanks, when can I come?", client);

    const content = calls[0].messages[0].content as Anthropic.Beta.BetaTextBlockParam[];
    expect(content[0].text).toContain("Your quote is ready.");
    expect(content[1].text).toBe("Thanks, when can I come?");
    expect(await store.listUnsyncedStaffMessages(conversationId)).toHaveLength(0);
  });

  it("reports invalid tool input back to the model instead of crashing", async () => {
    const { client, calls } = fakeClient([
      { stop_reason: "tool_use", content: [toolUse("t1", "update_lead", { name: 42 })] },
      { stop_reason: "end_turn", content: [text("OK")] },
    ]);

    await runAgentTurn(store, conversationId, "hi", client);

    const results = calls[1].messages[2].content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results[0].is_error).toBe(true);
  });

  it("never downgrades a lead that was handed off", async () => {
    await store.updateConversation(conversationId, { stage: "handoff" });
    const { client } = fakeClient([
      { stop_reason: "tool_use", content: [toolUse("t1", "update_lead", leadInput({ stage: "qualifying" }))] },
      { stop_reason: "end_turn", content: [text("OK")] },
    ]);

    await runAgentTurn(store, conversationId, "one more question", client);

    expect((await store.getConversation(conversationId))!.stage).toBe("handoff");
  });

  it("answers with a safe message and alerts staff on refusal", async () => {
    const { client } = fakeClient([{ stop_reason: "refusal", content: [] }]);

    const result = await runAgentTurn(store, conversationId, "…", client);

    expect(result.reply).toMatch(/coordinator/i);
    expect((await store.getConversation(conversationId))!.stage).toBe("handoff");
  });
});
