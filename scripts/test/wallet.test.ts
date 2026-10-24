import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { Keypair } from "@solana/web3.js";
import { defaultDeployKeypair, loadKeypair } from "../src/wallet.js";

/** Program id from Anchor.toml / declare_id. The deploy keypair's public key. */
const PROGRAM_ID = "BuGsGWMTiDegcXukiLpf5AV2UwXFiRpgF42oAnU5ana1";

describe("defaultDeployKeypair", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("returns the only *-keypair.json", () => {
    dir = mkdtempSync(join(tmpdir(), "slot-clock-kp-"));
    writeFileSync(join(dir, "time_vesting-keypair.json"), "[1]");
    writeFileSync(join(dir, "notes.txt"), "ignore");
    assert.equal(defaultDeployKeypair(dir), join(dir, "time_vesting-keypair.json"));
  });

  it("rejects zero or several keypair files", () => {
    dir = mkdtempSync(join(tmpdir(), "slot-clock-kp-"));
    assert.throws(() => defaultDeployKeypair(dir), /No \*-keypair\.json/);
    writeFileSync(join(dir, "a-keypair.json"), "[]");
    writeFileSync(join(dir, "b-keypair.json"), "[]");
    assert.throws(() => defaultDeployKeypair(dir), /More than one/);
  });
});

describe("target/deploy keypair", () => {
  it("loads time_vesting-keypair.json and its public key is the program id", () => {
    const path = defaultDeployKeypair();
    assert.match(path, /target\/deploy\/time_vesting-keypair\.json$/);
    const kp = loadKeypair(path);
    assert.equal(kp.publicKey.toBase58(), PROGRAM_ID);
    assert.equal(kp.secretKey.length, 64);
  });

  it("loads a keypair passed explicitly", () => {
    const customDir = mkdtempSync(join(tmpdir(), "slot-clock-kp-"));
    try {
      const generated = Keypair.generate();
      const path = join(customDir, "custom-keypair.json");
      writeFileSync(path, JSON.stringify(Array.from(generated.secretKey)));
      const loaded = loadKeypair(path);
      assert.equal(loaded.publicKey.toBase58(), generated.publicKey.toBase58());
    } finally {
      rmSync(customDir, { recursive: true, force: true });
    }
  });
});
