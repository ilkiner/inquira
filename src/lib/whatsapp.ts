import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// WhatsApp Business Cloud API (Meta). Env:
//   WHATSAPP_TOKEN            permanent system-user access token
//   WHATSAPP_PHONE_NUMBER_ID  the business phone number id
//   WHATSAPP_APP_SECRET       Meta app secret, to verify webhook signatures
//   WHATSAPP_VERIFY_TOKEN     any string you choose, entered in the Meta webhook setup

const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_TEXT = 4096;

export const whatsappConfigured = () =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_APP_SECRET);

// Meta signs each webhook body with the app secret (X-Hub-Signature-256: sha256=<hex>).
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const received = Buffer.from(header.slice("sha256=".length));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export type InboundMessage = {
  id: string; // wamid, used to drop retried deliveries
  from: string; // wa_id: the sender's number without "+"
  name: string | null;
  kind: "text" | "media" | "other";
  text: string; // message text, or the caption / a label for media
};

const payloadSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z
            .object({
              contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).partial() })).optional(),
              messages: z.array(z.looseObject({ id: z.string(), from: z.string(), type: z.string() })).optional(),
            })
            .loose(),
        }),
      ),
    }),
  ),
});

const MEDIA_TYPES: Record<string, string> = {
  image: "📷 Photo",
  video: "🎥 Video",
  audio: "🎤 Voice message",
  document: "📄 Document",
  sticker: "Sticker",
};

// Pulls patient messages out of a webhook payload. Status updates (sent/read) carry no messages.
export function parseInbound(payload: unknown): InboundMessage[] {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return [];
  const out: InboundMessage[] = [];
  for (const entry of parsed.data.entry) {
    for (const { value } of entry.changes) {
      const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile.name ?? null]));
      for (const m of value.messages ?? []) {
        const raw = m as Record<string, unknown>;
        const name = names.get(m.from) ?? null;
        if (m.type === "text") {
          const body = (raw.text as { body?: string } | undefined)?.body ?? "";
          out.push({ id: m.id, from: m.from, name, kind: "text", text: body.slice(0, 2000) });
        } else if (m.type in MEDIA_TYPES) {
          const caption = (raw[m.type] as { caption?: string } | undefined)?.caption;
          const label = MEDIA_TYPES[m.type];
          out.push({ id: m.id, from: m.from, name, kind: "media", text: caption ? `${label}: ${caption}` : label });
        } else {
          out.push({ id: m.id, from: m.from, name, kind: "other", text: `[${m.type} message]` });
        }
      }
    }
  }
  return out;
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendWhatsAppText(to: string, text: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: "WhatsApp is not configured" };

  for (const chunk of splitText(text)) {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: chunk } }),
    });
    if (!res.ok) {
      // Most common: error 131047, more than 24h since the patient's last message.
      // Outside that window only pre-approved templates can be sent.
      const body = await res.text().catch(() => "");
      console.error(`[whatsapp] send failed ${res.status}: ${body}`);
      return { ok: false, error: `WhatsApp API ${res.status}` };
    }
  }
  return { ok: true };
}

function splitText(text: string): string[] {
  if (text.length <= MAX_TEXT) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > MAX_TEXT) {
    const cut = Math.max(rest.lastIndexOf("\n", MAX_TEXT), rest.lastIndexOf(" ", MAX_TEXT));
    const at = cut > MAX_TEXT / 2 ? cut : MAX_TEXT;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
