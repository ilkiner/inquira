import { after, NextResponse, type NextRequest } from "next/server";
import { handleWhatsAppMessage } from "@/lib/channels/whatsapp-inbound";
import { getStore } from "@/lib/store";
import { parseInbound, sendWhatsAppText, verifySignature } from "@/lib/whatsapp";

// Allow time for the AI reply that runs after the 200 is sent.
export const maxDuration = 60;

// Meta's one-time webhook verification handshake.
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return new NextResponse("Not configured", { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  // Acknowledge immediately (Meta retries slow webhooks) and answer afterwards.
  const messages = parseInbound(payload);
  if (messages.length > 0) {
    after(async () => {
      const store = getStore();
      for (const msg of messages) {
        try {
          await handleWhatsAppMessage(store, msg, { send: sendWhatsAppText });
        } catch (err) {
          console.error("[whatsapp] failed to handle message", msg.id, err);
        }
      }
    });
  }
  return NextResponse.json({ ok: true });
}
