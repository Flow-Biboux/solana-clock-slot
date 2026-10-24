import { NextResponse } from "next/server";
import { decideAccess, type AccessDecision } from "@/lib/access";
import { sendKeyToOwner } from "@/lib/notify";
import { accessStore, metricsConfigured, metricsKeyAuthorized } from "@/lib/reports-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!metricsConfigured().database) {
    return NextResponse.json({ error: "Access requests are not configured" }, { status: 503 });
  }
  const key = request.headers.get("x-metrics-key");
  if (!(await metricsKeyAuthorized(key))) {
    return NextResponse.json({ error: "Invalid metrics key" }, { status: 401 });
  }
  let body: { id?: string; decision?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  if (!body.id || (body.decision !== "approve" && body.decision !== "deny")) {
    return NextResponse.json({ error: "id and decision are required" }, { status: 400 });
  }
  const result = await decideAccess(accessStore(), sendKeyToOwner, body.id, body.decision as AccessDecision, "metrics-key");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, key: result.key ?? null });
}
