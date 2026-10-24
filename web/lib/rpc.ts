import { Connection } from "@solana/web3.js";
import { PERFORMANCE_SAMPLE_LIMIT, SPEED_CACHE_MS, type Cluster } from "./constants";

const ALLOWED_METHODS = new Set([
  "getAccountInfo",
  "getSlot",
  "getBlockTime",
  "getRecentPerformanceSamples",
]);

export function rpcUrl(cluster: Cluster): string {
  const url = cluster === "mainnet" ? process.env.HELIUS_RPC_MAINNET : process.env.HELIUS_RPC_DEVNET;
  if (!url) throw new Error(`Missing HELIUS_RPC_${cluster.toUpperCase()}`);
  return url;
}

export function connectionFor(cluster: Cluster): Connection {
  return new Connection(rpcUrl(cluster), {
    commitment: "confirmed",
    httpHeaders: {},
    fetch: async (input, init) => {
      const body = typeof init?.body === "string" ? init.body : "";
      const method = body.match(/"method"\s*:\s*"([^"]+)"/)?.[1];
      if (method && !ALLOWED_METHODS.has(method)) {
        throw new Error(`RPC method not allowed: ${method}`);
      }
      return fetch(input, init);
    },
  });
}

export interface SlotSpeed {
  avgMs: number;
  minMs: number;
  maxMs: number;
  samples: number;
  windowSecs: number;
}

const cache = new Map<Cluster, { at: number; speed: SlotSpeed }>();

export async function measureSlotSpeed(conn: Connection, limit = PERFORMANCE_SAMPLE_LIMIT): Promise<SlotSpeed> {
  const samples = (await conn.getRecentPerformanceSamples(limit)).filter(
    (s) => s.numSlots > 0 && s.samplePeriodSecs > 0,
  );
  if (samples.length === 0) throw new Error("No performance samples returned by the RPC node");
  const windowSecs = samples.reduce((acc, s) => acc + s.samplePeriodSecs, 0);
  const totalSlots = samples.reduce((acc, s) => acc + s.numSlots, 0);
  const perSample = samples.map((s) => (s.samplePeriodSecs * 1000) / s.numSlots);
  return {
    avgMs: (windowSecs * 1000) / totalSlots,
    minMs: Math.min(...perSample),
    maxMs: Math.max(...perSample),
    samples: samples.length,
    windowSecs,
  };
}

export async function cachedSlotSpeed(cluster: Cluster, conn: Connection): Promise<SlotSpeed> {
  const hit = cache.get(cluster);
  if (hit && Date.now() - hit.at < SPEED_CACHE_MS) return hit.speed;
  const speed = await measureSlotSpeed(conn);
  cache.set(cluster, { at: Date.now(), speed });
  return speed;
}

export async function blockTimeNear(
  conn: Connection,
  slot: number,
  step: 1 | -1,
  maxTries = 50,
): Promise<{ slot: number; ts: number }> {
  let s = slot;
  for (let i = 0; i < maxTries; i++, s += step) {
    try {
      const ts = await conn.getBlockTime(s);
      if (ts !== null) return { slot: s, ts };
    } catch {
      // skipped slot
    }
  }
  throw new Error(`No block time found within ${maxTries} slots of ${slot}`);
}
