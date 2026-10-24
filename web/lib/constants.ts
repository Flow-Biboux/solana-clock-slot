export const BASE_PATH = "";
export const LEGACY_MS_PER_SLOT = 400;
export const MS_PER_DAY = 86_400_000;
export const LEGACY_SLOTS_PER_DAY = MS_PER_DAY / LEGACY_MS_PER_SLOT;
export const SPEED_OFF_THRESHOLD = 0.05;
export const IDL_MAX_BYTES = 200_000;
export const RATE_LIMIT_PER_MINUTE = 20;
export const SPEED_CACHE_MS = 5_000;
export const SPEED_POLL_MS = 5_000;
export const PERFORMANCE_SAMPLE_LIMIT = 30;

export const SIMD_0525_URL = "https://solana.com/upgrades/reduced-slot-times";
export const ALPENGLOW_URL = "https://solana.com/upgrades/alpenglow";

export const SIMD_STEPS = [
  { date: "2026-08-21", slot: 440_640_000, ms: 350 },
  { date: "2026-08-28", slot: 442_368_000, ms: 300 },
  { date: "2026-09-18", slot: 447_984_000, ms: 250 },
  { date: "2026-10-09", slot: 454_896_000, ms: 200 },
] as const;

export const CLUSTERS = ["mainnet", "devnet"] as const;
export type Cluster = (typeof CLUSTERS)[number];
