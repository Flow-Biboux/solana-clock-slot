import { decideAccess, type AccessDecision } from "./access";
import { answerTelegramCallback, sendKeyToOwner } from "./notify";
import { accessStore, metricsConfigured } from "./reports-store";

export interface TelegramUpdate {
  update_id?: number;
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number | string } };
  };
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const query = update.callback_query;
  if (!query?.id || !query.data) return;
  const ownerChat = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChat || String(query.message?.chat?.id ?? "") !== ownerChat) return;
  const match = /^(approve|deny):([0-9a-f-]{36})$/i.exec(query.data);
  if (!match || !metricsConfigured().database) {
    await answerTelegramCallback(query.id);
    return;
  }
  await decideAccess(accessStore(), sendKeyToOwner, match[2], match[1] as AccessDecision, "telegram");
  await answerTelegramCallback(query.id);
}
