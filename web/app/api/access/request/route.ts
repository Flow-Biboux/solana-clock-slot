import { NextResponse } from "next/server";
import { parseAccessRequest } from "@/lib/access";
import { notifyAccessRequest, telegramConfigured } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { hasPendingAccessRequest, insertAccessRequest, metricsConfigured } from "@/lib/reports-store";

export const dynamic = "force-dynamic";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request) {
  if (!rateLimit(clientIp(request))) {
    return NextResponse.json({ error: "Rate limit: 20 requests per minute" }, { status: 429 });
  }
  if (!metricsConfigured().database) {
    return NextResponse.json({ error: "Access requests are not configured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const parsed = parseAccessRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (await hasPendingAccessRequest(parsed.value.email)) return NextResponse.json({ ok: true });
  const id = await insertAccessRequest(parsed.value);
  if (!telegramConfigured()) {
    return NextResponse.json({ error: "Request stored, but Telegram is not configured" }, { status: 503 });
  }
  try {
    await notifyAccessRequest({ id, ...parsed.value });
  } catch {
    return NextResponse.json({ error: "Request stored, but Telegram notification failed" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
