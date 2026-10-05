import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runAgentTurn } from "@/lib/agent/run";
import { allow, clientIp } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";
import type { Conversation, DisplayMessage } from "@/lib/types";

const MAX_PATIENT_MESSAGES = 60;

const postBody = z.object({
  conversationId: z.uuid().optional(),
  visitorToken: z.uuid().optional(),
  message: z.string().trim().min(1).max(2000),
});

type PublicMessage = Pick<DisplayMessage, "id" | "role" | "text" | "createdAt">;
const toPublic = (m: DisplayMessage): PublicMessage => ({
  id: m.id,
  role: m.role,
  text: m.text,
  createdAt: m.createdAt,
});

function tokenMatches(conversation: Conversation, token: string | null | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(conversation.visitorToken);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Patient sends a message. Creates the conversation on first message.
export async function POST(request: NextRequest) {
  if (!allow(`ip:${clientIp(request.headers)}`, 20, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = postBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { conversationId, visitorToken, message } = parsed.data;

  const store = getStore();
  let conversation: Conversation | null;
  if (conversationId) {
    conversation = await store.getConversation(conversationId);
    if (!conversation || !tokenMatches(conversation, visitorToken)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  } else {
    conversation = await store.createConversation();
  }

  const history = await store.listMessages(conversation.id);
  if (history.filter((m) => m.role === "patient").length >= MAX_PATIENT_MESSAGES) {
    return NextResponse.json({ error: "conversation_limit" }, { status: 429 });
  }

  const patientMessage = await store.addMessage(conversation.id, "patient", message);
  const messages: PublicMessage[] = [toPublic(patientMessage)];

  if (conversation.mode === "ai") {
    const { reply } = await runAgentTurn(store, conversation.id, message);
    messages.push(toPublic(await store.addMessage(conversation.id, "assistant", reply)));
  } else {
    // A coordinator is handling this chat; just flag it for them.
    await store.updateConversation(conversation.id, { unreadForStaff: true });
  }

  return NextResponse.json({
    conversationId: conversation.id,
    visitorToken: conversation.visitorToken,
    messages,
  });
}

// Widget polls for new messages (e.g. coordinator replies) and restores history.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = z.uuid().safeParse(params.get("conversationId"));
  if (!id.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  if (!allow(`poll:${clientIp(request.headers)}`, 120, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const store = getStore();
  const conversation = await store.getConversation(id.data);
  if (!conversation || !tokenMatches(conversation, params.get("visitorToken"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const after = params.get("after") ?? undefined;
  const messages = await store.listMessages(conversation.id, after);
  return NextResponse.json({ messages: messages.map(toPublic), mode: conversation.mode });
}
