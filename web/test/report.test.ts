import { describe, expect, it } from "vitest";
import { containsPrivateFields, parseReport, toPublicMetrics } from "@/lib/report";

const PUBKEY = "11111111111111111111111111111111";

describe("parseReport", () => {
  it("rejects an unknown kind, a bad pubkey, and a long note", () => {
    expect(parseReport({ kind: "other" }).ok).toBe(false);
    expect(parseReport({ kind: "pda", cluster: "mainnet", address: "not-a-key" }).ok).toBe(false);
    expect(parseReport({ kind: "error", note: "x".repeat(501) }).ok).toBe(false);
  });

  it("accepts an affected account and a tool error without an address", () => {
    const pda = parseReport({ kind: "pda", cluster: "devnet", address: PUBKEY, verdict: "AFFECTED", note: "cliff" });
    const problem = parseReport({ kind: "error", note: "page froze" });
    expect(pda.ok && pda.value.address).toBe(PUBKEY);
    expect(problem.ok && problem.value.address).toBe(null);
  });
});

describe("public metrics", () => {
  it("counts rows and does not carry addresses or notes", () => {
    const summary = toPublicMetrics([
      { kind: "pda", verdict: "AFFECTED", cluster: "mainnet" },
      { kind: "error", verdict: null, cluster: null },
    ]);
    expect(summary.total).toBe(2);
    expect(summary.byKind.pda).toBe(1);
    expect(summary.byVerdict.AFFECTED).toBe(1);
    expect(containsPrivateFields({ summary })).toBe(false);
    expect(JSON.stringify(summary)).not.toMatch(/address|note/);
  });
});
