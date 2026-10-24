import { NextResponse } from "next/server";
import { telegramWebhookAuthorized } from "@/lib/notify";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/telegram-updates";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!telegramWebhookAuthorized(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }
  try {
    const update = (await request.json()) as TelegramUpdate;
    await handleTelegramUpdate(update);
  } catch {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: true });
}
