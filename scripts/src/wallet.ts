import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import anchor, { type Idl, type Program as ProgramT } from "@coral-xyz/anchor";
const { AnchorProvider, Program } = anchor; // CommonJS package: destructure the default import
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import { arg, connect } from "./clock.js";

const KEYPAIR_SUFFIX = "-keypair.json";
const KEYPAIR_SECRET_LENGTH = 64;
/** `scripts/src` -> repo `target/deploy`, where `anchor build` writes `*-keypair.json`. */
const DEPLOY_DIR_FROM_SRC = "../../target/deploy";

export const DEPLOY_KEYPAIR_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  DEPLOY_DIR_FROM_SRC
);

function isMissingDir(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ENOENT";
}

/** The single `*-keypair.json` in `dir`. Zero or several files is an error. */
export function defaultDeployKeypair(dir = DEPLOY_KEYPAIR_DIR): string {
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(KEYPAIR_SUFFIX));
  } catch (err) {
    if (isMissingDir(err)) {
      throw new Error(`No ${dir}. Pass --keypair <path>, or run anchor build.`);
    }
    throw err;
  }
  if (names.length === 0) {
    throw new Error(`No *${KEYPAIR_SUFFIX} in ${dir}. Pass --keypair <path>.`);
  }
  if (names.length > 1) {
    throw new Error(
      `More than one *${KEYPAIR_SUFFIX} in ${dir}: ${names.join(", ")}. Pass --keypair <path>.`
    );
  }
  return resolve(dir, names[0]);
}

function readSecret(path: string): Uint8Array {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read keypair at ${path}: ${message}`);
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== KEYPAIR_SECRET_LENGTH ||
    parsed.some((byte) => typeof byte !== "number")
  ) {
    throw new Error(`Keypair file ${path} must be a JSON array of ${KEYPAIR_SECRET_LENGTH} numbers.`);
  }
  return Uint8Array.from(parsed);
}

/**
 * Wallet for the scripts.
 * `--keypair <path>` wins. Otherwise the only `*-keypair.json` in `target/deploy`.
 */
export function loadKeypair(explicitPath?: string): Keypair {
  const path = explicitPath ?? arg("keypair") ?? defaultDeployKeypair();
  return Keypair.fromSecretKey(readSecret(path));
}

export function loadProgram(kp: Keypair): ProgramT {
  const idlPath = arg("idl", "../target/idl/time_vesting.json")!;
  const idl = JSON.parse(readFileSync(idlPath, "utf8")) as Idl;

  const wallet = {
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (tx instanceof VersionedTransaction) tx.sign([kp]);
      else tx.partialSign(kp);
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      for (const tx of txs) {
        if (tx instanceof VersionedTransaction) tx.sign([kp]);
        else tx.partialSign(kp);
      }
      return txs;
    },
  };
  const provider = new AnchorProvider(connect(), wallet, { commitment: "confirmed" });
  return new Program(idl, provider);
}
