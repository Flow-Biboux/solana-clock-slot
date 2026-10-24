/**
 * Time-risk checker for one account.
 *
 *   npm run check -- --account <ADDRESS> [--idl ../target/idl/time_vesting.json]   (RPC_URL comes from ../.env)
 *
 * Reads an Anchor account, finds fields that store time as slots or as
 * timestamps, and shows what each slot field means at the real slot speed
 * versus the legacy 400 ms assumption.
 *
 * Heuristic, not an audit: it reads account data, not program logic.
 * Field names are matched by pattern (e.g. *_slot, *_ts).
 */
import { readFileSync } from "node:fs";
import anchor, { type Idl } from "@coral-xyz/anchor";
const { AnchorProvider, BorshAccountsCoder, Program } = anchor; // CommonJS package: destructure the default import
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  LEGACY_MS_PER_SLOT,
  arg,
  blockTimeNear,
  chainNow,
  connect,
  humanDuration,
  iso,
  measureSlotSpeed,
} from "./clock.js";

const INT_TYPES = new Set(["u16", "u32", "u64", "u128", "i16", "i32", "i64", "i128"]);
const SLOT_NAME = /slot/i;
const TS_NAME = /(_ts$|^ts$|timestamp|_time$|unix|_at$)/i;
const START_NAME = /(start|creat|init|open|begin)/i;

const accountArg = arg("account");
if (!accountArg) throw new Error("Usage: npm run check -- --account <ADDRESS> [--idl path/to/idl.json]");
const address = new PublicKey(accountArg);

const conn = connect();
const info = await conn.getAccountInfo(address);
if (!info) throw new Error(`Account ${address.toBase58()} not found on this cluster`);
const programId = info.owner;

// 1. Get the IDL: local file, or the one published on-chain by `anchor deploy`.
let idl: Idl | null;
const idlPath = arg("idl");
if (idlPath) {
  idl = JSON.parse(readFileSync(idlPath, "utf8")) as Idl;
} else {
  const readOnlyWallet = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: async <T>(tx: T) => tx,
    signAllTransactions: async <T>(txs: T[]) => txs,
  };
  const provider = new AnchorProvider(conn, readOnlyWallet, {});
  idl = await Program.fetchIdl(programId, provider);
}
if (!idl) throw new Error(`No IDL found for program ${programId.toBase58()}. Pass one with --idl.`);

// 2. Find the account type by its 8-byte discriminator, then decode.
const disc = info.data.subarray(0, 8);
const accountDef = (idl.accounts ?? []).find((a) => Buffer.from(a.discriminator).equals(disc));
if (!accountDef) throw new Error("Account discriminator does not match any account in this IDL");
const decoded = new BorshAccountsCoder(idl).decode(accountDef.name, info.data) as Record<string, unknown>;

const typeDef = (idl.types ?? []).find((t) => t.name === accountDef.name);
if (!typeDef || typeDef.type.kind !== "struct" || !typeDef.type.fields) {
  throw new Error(`Type ${accountDef.name} not found as a named struct in the IDL`);
}

// 3. Classify integer fields by name.
const slotFields: { name: string; value: number }[] = [];
const tsFields: { name: string; value: number }[] = [];
for (const field of typeDef.type.fields as { name: string; type: unknown }[]) {
  if (typeof field.type !== "string" || !INT_TYPES.has(field.type)) continue;
  const value = Number(String(decoded[field.name])); // handles BN and number
  if (SLOT_NAME.test(field.name)) slotFields.push({ name: field.name, value });
  else if (TS_NAME.test(field.name)) tsFields.push({ name: field.name, value });
}

console.log(`Account   ${address.toBase58()}`);
console.log(`Program   ${programId.toBase58()}`);
console.log(`Type      ${accountDef.name}`);
console.log(`Slot fields:      ${slotFields.map((f) => f.name).join(", ") || "none"}`);
console.log(`Timestamp fields: ${tsFields.map((f) => f.name).join(", ") || "none"}`);

if (slotFields.length === 0) {
  console.log("\nNo slot-based time fields found.");
  if (tsFields.length > 0) {
    console.log("Timestamps are safer, but since Alpenglow Clock.unix_timestamp is set by the leader");
    console.log("within a bound. Check any logic that needs it to track real time closely.");
  }
  process.exit(0);
}

// 4. Real slot speed and a chain-time anchor.
const speed = await measureSlotSpeed(conn);
const now = await chainNow(conn);

/** Real date of a slot: actual block time if in the past, forecast if in the future. */
async function realTime(slot: number): Promise<{ ts: number; how: string }> {
  if (slot <= now.slot) {
    const bt = await blockTimeNear(conn, slot, 1);
    return { ts: bt.ts, how: "observed" };
  }
  return { ts: now.ts + ((slot - now.slot) * speed.avgMs) / 1000, how: "forecast" };
}

// Reference point: the schedule's start slot if there is one, otherwise "now".
const startField = slotFields.find((f) => START_NAME.test(f.name));
const ref = startField
  ? { slot: startField.value, ts: (await realTime(startField.value)).ts, label: startField.name }
  : { slot: now.slot, ts: now.ts, label: "current slot" };

console.log(`\nReal slot speed: ${speed.avgMs.toFixed(1)} ms (legacy assumption: ${LEGACY_MS_PER_SLOT} ms)`);
console.log(`Reference: ${ref.label} = slot ${ref.slot} at ${iso(ref.ts)}`);
console.log(`Now: slot ${now.slot} at ${iso(now.ts)}\n`);

let worstGap = 0;
for (const f of slotFields) {
  if (f === startField) continue;
  const intended = ref.ts + ((f.value - ref.slot) * LEGACY_MS_PER_SLOT) / 1000;
  const real = await realTime(f.value);
  const gap = intended - real.ts; // > 0 means it happens earlier than intended
  worstGap = Math.max(worstGap, Math.abs(gap));

  console.log(`${f.name} = ${f.value}`);
  console.log(`  if slots were 400 ms:  ${iso(intended)}`);
  console.log(`  at real speed:         ${iso(real.ts)} (${real.how})`);
  console.log(`  -> ${gap >= 0 ? "EARLIER" : "LATER"} than intended by ${humanDuration(Math.abs(gap))}`);

  // Compare with a matching timestamp field, e.g. cliff_slot vs cliff_ts.
  const stem = f.name.replace(SLOT_NAME, "").replace(/_+$/, "");
  const twin = tsFields.find((t) => t.name.startsWith(stem) && stem.length > 0);
  if (twin) {
    const diff = twin.value - real.ts;
    console.log(`  vs ${twin.name} (${iso(twin.value)}): slot version fires ${humanDuration(Math.abs(diff))} ${diff >= 0 ? "before" : "after"} it`);
  }
  console.log("");
}

const drift = Math.abs(speed.avgMs - LEGACY_MS_PER_SLOT) / LEGACY_MS_PER_SLOT;
console.log(
  drift > 0.05
    ? `AT RISK: this schedule is stored in slots, and real slots are ${(drift * 100).toFixed(0)}% off the 400 ms assumption. Dates move by up to ${humanDuration(worstGap)}.`
    : "Slot fields found, but the current slot speed is close to 400 ms."
);
console.log("Check how the program converted durations into slots before relying on these dates.");
