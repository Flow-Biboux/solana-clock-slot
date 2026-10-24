import { NextResponse } from "next/server";
import { CLUSTERS, SIMD_0525_URL, SIMD_STEPS, LEGACY_MS_PER_SLOT, type Cluster } from "@/lib/constants";
import { cachedSlotSpeed, connectionFor } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const clusterParam = new URL(request.url).searchParams.get("cluster") ?? "mainnet";
  if (!CLUSTERS.includes(clusterParam as Cluster)) {
    return NextResponse.json({ error: "cluster must be mainnet or devnet" }, { status: 400 });
  }
  const cluster = clusterParam as Cluster;
  try {
    const speed = await cachedSlotSpeed(cluster, connectionFor(cluster));
    return NextResponse.json({
      cluster,
      legacyMs: LEGACY_MS_PER_SLOT,
      speed,
      steps: SIMD_STEPS,
      source: SIMD_0525_URL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "speed lookup failed";
    return NextResponse.json({ error: message.replace(/api-key=[^&\s]+/gi, "api-key=redacted") }, { status: 502 });
  }
}
