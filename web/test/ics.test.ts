import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/ics";

describe("ics", () => {
  it("emits a UTC calendar event", () => {
    const realUnix = Date.parse("2026-10-24T12:00:00Z") / 1000;
    const ics = buildIcs([
      { field: "cliff_slot", slot: 10, realUnix, intendedIso: "2026-10-24T12:00:00Z", range: "a..b" },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20261024T120000Z");
    expect(ics).toContain("END:VCALENDAR");
  });
});
