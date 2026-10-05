import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleWhatsAppMessage } from "@/lib/channels/whatsapp-inbound";
import { notifyCoordinator } from "@/lib/notify";
import { memoryStore as store } from "@/lib/store/memory";
import { parseInbound, verifySignature, type InboundMessage } from "@/lib/whatsapp";

vi.mock("@/lib/notify", () => ({
  notifyCoordinator: vi.fn(async () => {}),
  dashboardLink: (id: string) => `http://test/dashboard/leads/${id}`,
}));

const sign = (body: string, secret: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifySignature", () => {
  const body = JSON.stringify({ hello: "world" });
  it("accepts Meta's signature and rejects anything else", () => {
    expect(verifySignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
    expect(verifySignature(body, sign(body, "other"), "s3cret")).toBe(false);
    expect(verifySignature(body + " ", sign(body, "s3cret"), "s3cret")).toBe(false);
    expect(verifySignature(body, null, "s3cret")).toBe(false);
    expect(verifySignature(body, "sha256=short", "s3cret")).toBe(false);
  });
});

describe("parseInbound", () => {
  const payload = (messages: unknown[]) => ({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ wa_id: "4915112345", profile: { name: "Anna" } }],
              messages,
            },
          },
        ],
      },
    ],
  });

  it("extracts text, media and other messages", () => {
    const parsed = parseInbound(
      payload([
        { id: "m1", from: "4915112345", type: "text", text: { body: "Hello" } },
        { id: "m2", from: "4915112345", type: "image", image: { id: "img", caption: "my hairline" } },
        { id: "m3", from: "4915112345", type: "location", location: {} },
      ]),
    );
    expect(parsed).toEqual([
      { id: "m1", from: "4915112345", name: "Anna", kind: "text", text: "Hello" },
      { id: "m2", from: "4915112345", name: "Anna", kind: "media", text: "📷 Photo: my hairline" },
      { id: "m3", from: "4915112345", name: "Anna", kind: "other", text: "[location message]" },
    ]);
  });

  it("ignores status updates and junk", () => {
    expect(parseInbound({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] })).toEqual([]);
    expect(parseInbound({ nope: true })).toEqual([]);
    expect(parseInbound(null)).toEqual([]);
  });
});

describe("handleWhatsAppMessage", () => {
  let n = 0;
  const msg = (overrides: Partial<InboundMessage> = {}): InboundMessage => ({
    id: `wamid.${++n}.${Math.random()}`,
    from: `90555${n}${Math.floor(Math.random() * 1e5)}`,
    name: "Mehmet",
    kind: "text",
    text: "Saç ekimi ne kadar?",
    ...overrides,
  });
  const runAgent = vi.fn(async () => ({ reply: "FUE €1.900 – €2.800 arası.", handedOff: false }));
  const send = vi.fn(async () => ({ ok: true as const }));

  beforeEach(() => {
    runAgent.mockClear();
    send.mockClear();
    vi.mocked(notifyCoordinator).mockClear();
  });

  it("creates a WhatsApp lead, answers and sends the reply", async () => {
    const m = msg();
    await handleWhatsAppMessage(store, m, { runAgent, send });

    const c = (await store.findConversationByExternalUser("whatsapp", m.from))!;
    expect(c).toMatchObject({ channel: "whatsapp", name: "Mehmet", whatsapp: `+${m.from}` });
    expect((await store.listMessages(c.id)).map((x) => [x.role, x.text])).toEqual([
      ["patient", "Saç ekimi ne kadar?"],
      ["assistant", "FUE €1.900 – €2.800 arası."],
    ]);
    expect(send).toHaveBeenCalledWith(m.from, "FUE €1.900 – €2.800 arası.");
  });

  it("answers a retried delivery only once", async () => {
    const m = msg();
    await handleWhatsAppMessage(store, m, { runAgent, send });
    await handleWhatsAppMessage(store, m, { runAgent, send });
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps one conversation per number", async () => {
    const first = msg();
    await handleWhatsAppMessage(store, first, { runAgent, send });
    await handleWhatsAppMessage(store, msg({ from: first.from, text: "Ve DHI?" }), { runAgent, send });
    const c = (await store.findConversationByExternalUser("whatsapp", first.from))!;
    expect((await store.listMessages(c.id)).filter((x) => x.role === "patient")).toHaveLength(2);
  });

  it("stays silent when a coordinator has taken over", async () => {
    const first = msg();
    await handleWhatsAppMessage(store, first, { runAgent, send });
    const c = (await store.findConversationByExternalUser("whatsapp", first.from))!;
    await store.updateConversation(c.id, { mode: "human", unreadForStaff: false });
    runAgent.mockClear();
    send.mockClear();

    await handleWhatsAppMessage(store, msg({ from: first.from, text: "Tamam teşekkürler" }), { runAgent, send });

    expect(runAgent).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect((await store.getConversation(c.id))!.unreadForStaff).toBe(true);
  });

  it("alerts staff about photos and tells the AI it can't see them", async () => {
    await handleWhatsAppMessage(store, msg({ kind: "media", text: "📷 Photo" }), { runAgent, send });
    expect(notifyCoordinator).toHaveBeenCalledWith(expect.stringContaining("📷 Photo"));
    expect(runAgent.mock.calls[0]).toEqual([store, expect.any(String), expect.stringContaining("cannot open")]);
  });

  it("flags the lead and alerts staff when delivery fails", async () => {
    const m = msg();
    const failing = vi.fn(async () => ({ ok: false as const, error: "WhatsApp API 400" }));
    await handleWhatsAppMessage(store, m, { runAgent, send: failing });
    const c = (await store.findConversationByExternalUser("whatsapp", m.from))!;
    expect(c.unreadForStaff).toBe(true);
    expect(notifyCoordinator).toHaveBeenCalledWith(expect.stringContaining("Could not deliver"));
  });
});
