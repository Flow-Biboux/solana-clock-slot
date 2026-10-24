/**
 * Slot clock forecast.
 *
 *   npm run forecast -- --minutes 10 [--verify]   (RPC_URL comes from ../.env)
 *
 * 1. Measures the real slot duration from recent performance samples.
 * 2. Forecasts which slot will be current in N minutes, with the real speed
 *    and with the legacy 400 ms assumption.
 * 3. With --verify, waits N minutes and reports how wrong each forecast was.
 */
import {
  LEGACY_MS_PER_SLOT,
  arg,
  chainNow,
  connect,
  flag,
  humanDuration,
  iso,
  measureSlotSpeed,
} from "./clock.js";

const minutes = Number(arg("minutes", "10"));
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("--minutes must be a positive number");

const conn = connect();
const speed = await measureSlotSpeed(conn);
const now = await chainNow(conn);
const horizonMs = minutes * 60_000;

const realSlot = now.slot + Math.round(horizonMs / speed.avgMs);
const fastSlot = now.slot + Math.round(horizonMs / speed.minMs);
const slowSlot = now.slot + Math.round(horizonMs / speed.maxMs);
const legacySlot = now.slot + Math.round(horizonMs / LEGACY_MS_PER_SLOT);

console.log("Measured slot speed");
console.log(`  average   ${speed.avgMs.toFixed(1)} ms/slot (${speed.samples} samples, ${humanDuration(speed.windowSecs)} of history)`);
console.log(`  range     ${speed.minMs.toFixed(1)} to ${speed.maxMs.toFixed(1)} ms/slot`);
console.log(`  legacy    ${LEGACY_MS_PER_SLOT} ms/slot (old assumption)`);
console.log("");
console.log(`Now: slot ${now.slot} at ${iso(now.ts)} (chain time)`);
console.log(`Local clock minus chain time: ${(Date.now() / 1000 - now.ts).toFixed(1)} s`);
console.log("");
console.log(`Forecast for ${iso(now.ts + minutes * 60)} (+${minutes} min)`);
console.log(`  real speed     slot ${realSlot} (likely between ${slowSlot} and ${fastSlot})`);
console.log(`  legacy 400 ms  slot ${legacySlot}  -> off by ${realSlot - legacySlot} slots`);

if (flag("verify")) {
  console.log(`\nWaiting ${minutes} min to verify...`);
  await new Promise((r) => setTimeout(r, horizonMs));
  const actual = await chainNow(conn);
  // Normalise to the exact target time using the measured speed for the small remainder.
  const target = now.ts + minutes * 60;
  const actualAtTarget = actual.slot + Math.round(((target - actual.ts) * 1000) / speed.avgMs);
  const errReal = realSlot - actualAtTarget;
  const errLegacy = legacySlot - actualAtTarget;
  console.log(`Actual slot at target time: ~${actualAtTarget} (observed slot ${actual.slot} at ${iso(actual.ts)})`);
  console.log(`  real-speed forecast error   ${errReal} slots (~${((errReal * speed.avgMs) / 1000).toFixed(1)} s)`);
  console.log(`  legacy forecast error       ${errLegacy} slots (~${((errLegacy * speed.avgMs) / 1000).toFixed(1)} s)`);
}
