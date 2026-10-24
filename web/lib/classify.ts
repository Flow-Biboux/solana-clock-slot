export type FieldKind =
  | "absolute_slot"
  | "duration_slots"
  | "rate_per_slot"
  | "timestamp"
  | "seconds"
  | "ignored";

const TIMESTAMP = /(_ts$|^ts$|timestamp|_time$|unix|_at$)/i;

export function classifyFieldName(name: string): FieldKind {
  const n = name.toLowerCase();
  if (n.includes("per_slot")) return "rate_per_slot";
  if (
    n.endsWith("_slots") ||
    n.includes("delay_slots") ||
    n.includes("stale_slots") ||
    n.includes("halflife_slots") ||
    n.includes("cooldown_slots")
  ) {
    return "duration_slots";
  }
  if (n.includes("slot")) return "absolute_slot";
  if (n.endsWith("_secs") || n.endsWith("_seconds")) return "seconds";
  if (TIMESTAMP.test(n)) return "timestamp";
  return "ignored";
}
