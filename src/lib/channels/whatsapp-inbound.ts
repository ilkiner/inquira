import "server-only";
import { runAgentTurn } from "../agent/run";
import { dashboardLink, notifyCoordinator } from "../notify";
import type { Store } from "../store";
import type { InboundMessage, SendResult } from "../whatsapp";

type Deps = {
  runAgent?: typeof runAgentTurn;
  send: (to: string, text: string) => Promise<SendResult>;
};

// Handles one patient message received on WhatsApp: record it, let the AI answer
// (unless a coordinator has taken over) and send the answer back.
export async function handleWhatsAppMessage(store: Store, msg: InboundMessage, deps: Deps): Promise<void> {
  // Meta retries deliveries; answer each message once.
  if (!(await store.claimEvent(`wa:${msg.id}`))) return;

  let conversation = await store.findConversationByExternalUser("whatsapp", msg.from);
  conversation ??= await store.createConversation({
    channel: "whatsapp",
    externalUserId: msg.from,
    whatsapp: `+${msg.from}`,
    name: msg.name,
  });

  await store.addMessage(conversation.id, "patient", msg.text);

  if (msg.kind === "media") {
    // Photos matter a lot here (hair/dental assessments); make sure a human sees them.
    await notifyCoordinator(
      `${msg.text} from ${conversation.name ?? `+${msg.from}`} — open it in WhatsApp.\n${dashboardLink(conversation.id)}`,
    );
  }

  if (conversation.mode === "human") {
    await store.updateConversation(conversation.id, { unreadForStaff: true });
    return;
  }

  const agentInput =
    msg.kind === "text"
      ? msg.text
      : `${msg.text}\n[The patient sent a ${msg.kind === "media" ? "file" : "message"} you cannot open. The coordinator can see it in WhatsApp. Acknowledge it and continue.]`;

  const { reply } = await (deps.runAgent ?? runAgentTurn)(store, conversation.id, agentInput);
  await store.addMessage(conversation.id, "assistant", reply);

  const sent = await deps.send(msg.from, reply);
  if (!sent.ok) {
    await store.updateConversation(conversation.id, { unreadForStaff: true });
    await notifyCoordinator(
      `⚠️ Could not deliver the AI reply on WhatsApp (${sent.error}).\n${dashboardLink(conversation.id)}`,
    );
  }
}
