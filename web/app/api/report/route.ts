import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { parseReport } from "@/lib/report";
import { insertReport, metricsConfigured } from "@/lib/reports-store";

export const dynamic = "force-dynamic";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request) {
  if (!rateLimit(clientIp(request))) {
    return NextResponse.json({ error: "Rate limit: 20 reports per minute" }, { status: 429 });
  }
  if (!metricsConfigured().database) {
    return NextResponse.json({ error: "Reports are not configured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const parsed = parseReport(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    await insertReport(parsed.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "report failed";
    return NextResponse.json({ error: message.includes("DATABASE_URL") ? "Reports are not configured" : "Could not store the report" }, { status: 503 });
  }
}
