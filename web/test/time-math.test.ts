import { describe, expect, it } from "vitest";
import { durationSecs, ratePerDay, verdict } from "@/lib/time-math";

describe("time math", () => {
  it("216000 duration slots is 24h at 400 ms and 12h at 200 ms", () => {
    expect(durationSecs(216_000, 400)).toBe(86_400);
    expect(durationSecs(216_000, 200)).toBe(43_200);
  });

  it("rate 35 per slot doubles when slots are 200 ms", () => {
    expect(ratePerDay(35, 400)).toBe(7_560_000);
    expect(ratePerDay(35, 200)).toBe(15_120_000);
  });

  it("marks slot fields affected only when speed is more than 5% off 400 ms", () => {
    expect(verdict(["absolute_slot"], 200)).toBe("AFFECTED");
    expect(verdict(["timestamp"], 200)).toBe("NOT AFFECTED BY SLOT SPEED");
    expect(verdict(["ignored"], 200)).toBe("NO TIME FIELDS FOUND");
    expect(verdict(["absolute_slot"], 400)).toBe("NOT AFFECTED BY SLOT SPEED");
  });
});
