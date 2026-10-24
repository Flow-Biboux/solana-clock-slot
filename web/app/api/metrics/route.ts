import { NextResponse } from "next/server";
import { toPublicMetrics } from "@/lib/report";
import { listPendingAccessRequests, listReports, metricsConfigured, metricsKeyAuthorized } from "@/lib/reports-store";

export const dynamic = "force-dynamic";

const DETAIL_LIMIT = 100;

export async function GET(request: Request) {
  if (!metricsConfigured().database) {
    return NextResponse.json({ error: "Reports are not configured" }, { status: 503 });
  }
  const key = request.headers.get("x-metrics-key");
  const wantsDetail = key !== null && key.length > 0;
  try {
    const rows = await listReports();
    const summary = toPublicMetrics(rows);
    if (!wantsDetail) return NextResponse.json({ summary });
    if (!(await metricsKeyAuthorized(key))) {
      return NextResponse.json({ error: "Invalid metrics key" }, { status: 401 });
    }
    const requests = await listPendingAccessRequests();
    return NextResponse.json({
      summary,
      reports: rows.slice(0, DETAIL_LIMIT),
      requests,
    });
  } catch {
    return NextResponse.json({ error: "Could not read reports" }, { status: 503 });
  }
}
