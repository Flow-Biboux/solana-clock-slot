import { LEGACY_MS_PER_SLOT, LEGACY_SLOTS_PER_DAY, MS_PER_DAY, SPEED_OFF_THRESHOLD } from "./constants";
import type { FieldKind } from "./classify";

export function slotsPerDay(avgMs: number): number {
  return MS_PER_DAY / avgMs;
}

export function durationSecs(slots: number, msPerSlot: number): number {
  return (slots * msPerSlot) / 1000;
}

export function ratePerDay(perSlot: number, msPerSlot: number): number {
  return perSlot * slotsPerDay(msPerSlot);
}

export function intendedUnix(refTs: number, refSlot: number, slot: number): number {
  return refTs + ((slot - refSlot) * LEGACY_MS_PER_SLOT) / 1000;
}

export function forecastUnix(nowTs: number, nowSlot: number, slot: number, avgMs: number): number {
  return nowTs + ((slot - nowSlot) * avgMs) / 1000;
}

export type Verdict = "AFFECTED" | "NOT AFFECTED BY SLOT SPEED" | "NO TIME FIELDS FOUND";

export function verdict(kinds: FieldKind[], avgMs: number): Verdict {
  const slotBased = kinds.some((k) => k === "absolute_slot" || k === "duration_slots" || k === "rate_per_slot");
  const timeBased = kinds.some((k) => k === "timestamp" || k === "seconds");
  const drift = Math.abs(avgMs - LEGACY_MS_PER_SLOT) / LEGACY_MS_PER_SLOT;
  if (slotBased && drift > SPEED_OFF_THRESHOLD) return "AFFECTED";
  if (timeBased || slotBased) return "NOT AFFECTED BY SLOT SPEED";
  return "NO TIME FIELDS FOUND";
}

export const LEGACY_SLOTS_PER_DAY_VALUE = LEGACY_SLOTS_PER_DAY;
