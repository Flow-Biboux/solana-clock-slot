import { secretMatches } from "./access";

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function notifyAccessRequest(request: {
  id: string;
  name: string;
  email: string;
  message: string | null;
}): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("Telegram is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `Access request\n${request.name}\n${request.email}\n${request.message ?? ""}`,
      reply_markup: {
        inline_keyboard: [[
          { text: "Approve", callback_data: `approve:${request.id}` },
          { text: "Deny", callback_data: `deny:${request.id}` },
        ]],
      },
    }),
  });
  if (!response.ok) throw new Error("Telegram notification failed");
}

export async function sendKeyToOwner(email: string, rawKey: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("Telegram is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      parse_mode: "Markdown",
      text: `Approved ${email}\nKey (send this yourself, it is not stored):\n\`${rawKey}\``,
    }),
  });
  if (!response.ok) throw new Error("Telegram key delivery failed");
}

export function telegramWebhookAuthorized(provided: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  return secretMatches(expected, provided);
}

export async function answerTelegramCallback(callbackId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId }),
  });
}
