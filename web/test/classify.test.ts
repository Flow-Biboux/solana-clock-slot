import { describe, expect, it } from "vitest";
import { classifyFieldName } from "@/lib/classify";

const cases: [string, string][] = [
  ["cliff_slot", "absolute_slot"],
  ["end_slot", "absolute_slot"],
  ["force_close_delay_slots", "duration_slots"],
  ["maintenance_fee_per_slot", "rate_per_slot"],
  ["max_staleness_secs", "seconds"],
  ["cliff_ts", "timestamp"],
  ["mark_ewma_halflife_slots", "duration_slots"],
];

describe("classifyFieldName", () => {
  it.each(cases)("%s -> %s", (name, kind) => {
    expect(classifyFieldName(name)).toBe(kind);
  });
});
