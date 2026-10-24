import { Connection } from "@solana/web3.js";
import { loadProjectEnv } from "./env.js";

loadProjectEnv();

/** The old assumption: 400 ms per slot (SDK DEFAULT_TICKS_PER_SECOND / DEFAULT_TICKS_PER_SLOT). */
export const LEGACY_MS_PER_SLOT = 400;

export function connect(): Connection {
  const url = process.env.RPC_URL;
  if (!url) {
    throw new Error(
      "Set RPC_URL in the repo-root .env, for example: RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
    );
  }
  return new Connection(url, "confirmed");
}

export interface SlotSpeed {
  avgMs: number; // average real duration of one slot
  minMs: number; // fastest sample
  maxMs: number; // slowest sample
  samples: number;
  windowSecs: number; // how much history the average covers
}

/**
 * Measures how long a slot really lasts, from the node's recent performance
 * samples (each sample = number of slots that advanced during ~60 s).
 * Skipped slots are included, which is what you want when converting a
 * slot number into a date.
 */
export async function measureSlotSpeed(conn: Connection, limit = 30): Promise<SlotSpeed> {
  const samples = (await conn.getRecentPerformanceSamples(limit)).filter(
    (s) => s.numSlots > 0 && s.samplePeriodSecs > 0
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

/**
 * Block time (Unix seconds) of `slot`. If that slot was skipped or has no
 * time yet, walks in `step` direction (+1 forward, -1 backward) until it finds one.
 */
export async function blockTimeNear(
  conn: Connection,
  slot: number,
  step: 1 | -1,
  maxTries = 50
): Promise<{ slot: number; ts: number }> {
  let s = slot;
  for (let i = 0; i < maxTries; i++, s += step) {
    try {
      const ts = await conn.getBlockTime(s);
      if (ts !== null) return { slot: s, ts };
    } catch {
      // skipped slot or not available yet: try the next one
    }
  }
  throw new Error(`No block time found within ${maxTries} slots of ${slot}`);
}

/** A recent (slot, chain time) pair to anchor forecasts on. */
export async function chainNow(conn: Connection): Promise<{ slot: number; ts: number }> {
  const slot = await conn.getSlot("confirmed");
  return blockTimeNear(conn, slot, -1);
}

export function iso(unixSecs: number): string {
  return new Date(unixSecs * 1000).toISOString().replace(".000Z", "Z");
}

export function humanDuration(secs: number): string {
  const sign = secs < 0 ? "-" : "";
  let s = Math.abs(Math.round(secs));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const parts = [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean);
  return sign + parts.join(" ");
}

export function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
