import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentTurn, type ChatClient } from "@/lib/agent/run";
import { notifyCoordinator } from "@/lib/notify";
import { memoryStore as store } from "@/lib/store/memory";

vi.mock("@/lib/notify", () => ({
  notifyCoordinator: vi.fn(async () => {}),
  dashboardLink: (id: string) => `http://test/dashboard/leads/${id}`,
}));

type Choice = ChatCompletion["choices"][number];
type FakeReply = { content?: string | null; toolCalls?: [string, string, unknown][]; finish?: Choice["finish_reason"] };

function completion({ content = null, toolCalls = [], finish }: FakeReply): ChatCompletion {
  return {
    id: "x",
    object: "chat.completion",
    created: 0,
    model: "test",
    choices: [
      {
        index: 0,
        logprobs: null,
        finish_reason: finish ?? (toolCalls.length ? "tool_calls" : "stop"),
        message: {
          role: "assistant",
          content,
          refusal: null,
          tool_calls: toolCalls.length
            ? toolCalls.map(([id, name, args]) => ({
                id,
                type: "function" as const,
                function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
              }))
            : undefined,
        },
      },
    ],
  };
}

function fakeClient(replies: (FakeReply | Error)[]) {
  const calls: ChatCompletionCreateParamsNonStreaming[] = [];
  const client = {
    chat: {
      completions: {
        create: vi.fn(async (params: ChatCompletionCreateParamsNonStreaming) => {
          // Snapshot: the agent keeps mutating its turn array after the call.
          calls.push(structuredClone(params));
          const next = replies.shift();
          if (!next) throw new Error("unexpected extra API call");
          if (next instanceof Error) throw next;
          return completion(next);
        }),
      },
    },
  } as unknown as ChatClient;
  return { client, calls };
}

describe("runAgentTurn", () => {
  let conversationId: string;
  beforeEach(async () => {
    vi.mocked(notifyCoordinator).mockClear();
    conversationId = (await store.createConversation()).id;
  });

  it("runs tools, records the lead and appends the full turn to history", async () => {
    const { client, calls } = fakeClient([
      {
        toolCalls: [
          [
            "t1",
            "update_lead",
            {
              name: "Anna",
              country: "Germany",
              treatment: "FUE hair transplant",
              whatsapp: "+49 151 234567",
              stage: "qualified",
              score: 80,
            },
          ],
          ["t2", "handoff_to_coordinator", { reason: "Wants to book in March", urgency: "high" }],
        ],
      },
      { content: "Danke Anna! Elif meldet sich gleich bei Ihnen." },
    ]);

    const result = await runAgentTurn(store, conversationId, "Ich möchte im März kommen", client);

    expect(result.reply).toBe("Danke Anna! Elif meldet sich gleich bei Ihnen.");
    expect(result.handedOff).toBe(true);

    const lead = (await store.getConversation(conversationId))!;
    expect(lead).toMatchObject({
      name: "Anna",
      country: "Germany",
      whatsapp: "+49 151 234567",
      score: 80,
      stage: "handoff", // handoff wins over the model's "qualified"
      handoffReason: "Wants to book in March",
      unreadForStaff: true,
    });

    // user → assistant(tool_calls) → tool → tool → assistant(text)
    expect(lead.apiHistory.map((m) => m.role)).toEqual(["user", "assistant", "tool", "tool", "assistant"]);
    // The system prompt is sent on every request but never stored.
    expect(calls[0].messages[0].role).toBe("system");
    expect(calls[1].messages.slice(1)).toEqual(lead.apiHistory.slice(0, 4));
    expect(notifyCoordinator).toHaveBeenCalledWith(expect.stringContaining("Handoff"));
  });

  it("builds on the existing history on the next turn", async () => {
    const first = fakeClient([{ content: "Hello!" }]);
    await runAgentTurn(store, conversationId, "Hi", first.client);
    const second = fakeClient([{ content: "Sure." }]);
    await runAgentTurn(store, conversationId, "Prices?", second.client);

    expect(second.calls[0].messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect((await store.getConversation(conversationId))!.apiHistory).toHaveLength(4);
  });

  it("leaves history untouched and alerts staff when the API fails", async () => {
    await store.addMessage(conversationId, "staff", "Hi, this is Elif.");
    const { client } = fakeClient([new Error("429 rate limited")]);

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
    const { client, calls } = fakeClient([{ content: "Great!" }]);

    await runAgentTurn(store, conversationId, "Thanks, when can I come?", client);

    const user = calls[0].messages[1].content as string;
    expect(user).toContain("Your quote is ready.");
    expect(user.endsWith("Thanks, when can I come?")).toBe(true);
    expect(await store.listUnsyncedStaffMessages(conversationId)).toHaveLength(0);
  });

  it("reports malformed tool arguments back to the model instead of crashing", async () => {
    const { client, calls } = fakeClient([
      { toolCalls: [["t1", "handoff_to_coordinator", "{not json"]] },
      { content: "OK" },
    ]);

    await runAgentTurn(store, conversationId, "hi", client);

    const toolMessage = calls[1].messages[3];
    expect(toolMessage).toMatchObject({ role: "tool", tool_call_id: "t1" });
    expect(String(toolMessage.content)).toMatch(/^Error/);
  });

  it("tolerates loose arguments from open models", async () => {
    const { client } = fakeClient([
      { toolCalls: [["t1", "update_lead", { name: "Ali", country: "", score: "65", stage: "maybe" }]] },
      { content: "OK" },
    ]);

    await runAgentTurn(store, conversationId, "Ben Ali", client);

    expect((await store.getConversation(conversationId))!).toMatchObject({
      name: "Ali",
      country: null,
      score: 65,
      stage: "qualifying",
    });
  });

  it("never downgrades a lead that was handed off", async () => {
    await store.updateConversation(conversationId, { stage: "handoff" });
    const { client } = fakeClient([
      { toolCalls: [["t1", "update_lead", { stage: "qualifying" }]] },
      { content: "OK" },
    ]);

    await runAgentTurn(store, conversationId, "one more question", client);

    expect((await store.getConversation(conversationId))!.stage).toBe("handoff");
  });

  it("strips leaked <think> blocks from the reply", async () => {
    const { client } = fakeClient([{ content: "<think>price lookup…</think>\nFUE costs €1,900 – €2,800." }]);

    const result = await runAgentTurn(store, conversationId, "price?", client);

    expect(result.reply).toBe("FUE costs €1,900 – €2,800.");
  });

  it("stops calling tools after the round limit", async () => {
    const loop = { toolCalls: [["t", "update_lead", { stage: "unchanged" }]] as [string, string, unknown][] };
    const { client, calls } = fakeClient([loop, loop, loop, loop, { content: "Done." }]);

    const result = await runAgentTurn(store, conversationId, "hi", client);

    expect(result.reply).toBe("Done.");
    expect(calls.at(-1)!.tool_choice).toBe("none");
  });
});
