import "server-only";

// Optional Telegram alert for coordinators — most clinic teams already live in
// Telegram/WhatsApp, so a push there beats a dashboard nobody has open.
export async function notifyCoordinator(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.info(`[notify] ${text}`);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) console.error(`[notify] Telegram responded ${res.status}`);
  } catch (err) {
    console.error("[notify] Telegram request failed", err);
  }
}

export function dashboardLink(conversationId: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/dashboard/leads/${conversationId}`;
}
