import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import anchor, { type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { classifyFieldName } from "@/lib/classify";
import { intendedUnix } from "@/lib/time-math";

const { BorshAccountsCoder, BN } = anchor;

describe("vesting decode", () => {
  it("classifies vesting fields and computes the 400 ms date", async () => {
    const idl = JSON.parse(readFileSync(path.resolve(__dirname, "../../idl/time_vesting.json"), "utf8")) as Idl;
    const coder = new BorshAccountsCoder(idl);
    const startSlot = 1_000;
    const cliffSlot = 2_500;
    const endSlot = 4_000;
    const startTs = 1_700_000_000;
    const encoded = Buffer.from(await coder.encode("Vesting", {
      beneficiary: PublicKey.default,
      amount: new BN(1),
      start_slot: new BN(startSlot),
      cliff_slot: new BN(cliffSlot),
      end_slot: new BN(endSlot),
      start_ts: new BN(startTs),
      cliff_ts: new BN(startTs + 600),
      end_ts: new BN(startTs + 1_200),
      bump: 1,
    }));
    const decoded = coder.decode("Vesting", encoded) as Record<string, { toString(): string }>;
    expect(classifyFieldName("cliff_slot")).toBe("absolute_slot");
    expect(Number(decoded.cliff_slot.toString())).toBe(cliffSlot);
    expect(classifyFieldName("cliff_ts")).toBe("timestamp");
    const intended = intendedUnix(startTs, startSlot, cliffSlot);
    expect(intended).toBe(startTs + ((cliffSlot - startSlot) * 400) / 1000);
  });
});
