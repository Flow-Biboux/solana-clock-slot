/**
 * Creates the demo vesting PDA (one per wallet).
 *
 *   npm run create -- --cliff-secs 600 --duration-secs 1200 [--amount 1000000] [--keypair <path>]
 *   RPC_URL comes from ../.env. The wallet defaults to target/deploy/*-keypair.json.
 *
 * The program stores the cliff twice: as a slot computed with 400 ms slots,
 * and as a Unix timestamp. On 200 ms slots the slot version is reached first.
 */
import anchor from "@coral-xyz/anchor"; // CommonJS package: import the default, then destructure
const { BN } = anchor;
import { PublicKey } from "@solana/web3.js";
import { arg, iso } from "./clock.js";
import { loadKeypair, loadProgram } from "./wallet.js";

const amount = new BN(arg("amount", "1000000")!);
const cliffSecs = new BN(arg("cliff-secs", "600")!);
const durationSecs = new BN(arg("duration-secs", "1200")!);

const kp = loadKeypair();
const program = loadProgram(kp);
const [vesting] = PublicKey.findProgramAddressSync(
  [Buffer.from("vesting"), kp.publicKey.toBuffer()],
  program.programId
);

const signature = await program.methods
  .createVesting(amount, cliffSecs, durationSecs)
  .accountsPartial({ beneficiary: kp.publicKey, vesting })
  .rpc();

// The IDL is loaded at runtime, so account names are not typed: look it up by name.
const accounts = program.account as unknown as Record<string, { fetch(a: PublicKey): Promise<unknown> }>;
const v = (await accounts["vesting"].fetch(vesting)) as Record<string, { toString(): string }>;
console.log(`tx        ${signature}`);
console.log(`vesting   ${vesting.toBase58()}`);
for (const key of ["amount", "startSlot", "cliffSlot", "endSlot"]) {
  console.log(`${key.padEnd(10)}${v[key].toString()}`);
}
for (const key of ["startTs", "cliffTs", "endTs"]) {
  console.log(`${key.padEnd(10)}${v[key].toString()}  (${iso(Number(v[key].toString()))})`);
}
