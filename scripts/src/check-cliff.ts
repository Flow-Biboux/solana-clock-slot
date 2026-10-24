/**
 * Asks the program itself whether the cliff is reached, by slot and by time.
 * Uses a simulation, so it costs nothing and needs no transaction.
 *
 *   npm run check-cliff [--keypair <path>]
 *   RPC_URL comes from ../.env. The wallet defaults to target/deploy/*-keypair.json.
 *
 * Run it a few times between the slot cliff and the timestamp cliff:
 * the program logs "MISMATCH" while the two schedules disagree.
 */
import { PublicKey } from "@solana/web3.js";
import { loadKeypair, loadProgram } from "./wallet.js";

const kp = loadKeypair();
const program = loadProgram(kp);
const [vesting] = PublicKey.findProgramAddressSync(
  [Buffer.from("vesting"), kp.publicKey.toBuffer()],
  program.programId
);

const result = await program.methods.checkCliff().accountsPartial({ vesting }).simulate();
for (const line of result.raw) {
  if (line.startsWith("Program log:") && !line.includes("Instruction:")) console.log(line);
}
