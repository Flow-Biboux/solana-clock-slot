import { handleTelegramUpdate, type TelegramUpdate } from "./telegram-updates";

let started = false;

export function startTelegramPoll(): void {
  if (started || process.env.TELEGRAM_POLL !== "1") return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  started = true;
  void poll(token);
}

async function poll(token: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { method: "POST" });
  let offset = 0;
  for (;;) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offset, timeout: 25 }),
      });
      const body = (await response.json()) as { result?: TelegramUpdate[] };
      for (const update of body.result ?? []) {
        if (typeof update.update_id === "number") offset = update.update_id + 1;
        await handleTelegramUpdate(update);
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}
