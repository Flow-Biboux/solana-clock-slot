import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadProjectEnv } from "../src/env.js";

const KEY = "RPC_URL";

describe("loadProjectEnv", () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "slot-clock-env-"));
    previous = process.env[KEY];
  });

  afterEach(() => {
    if (previous === undefined) delete process.env[KEY];
    else process.env[KEY] = previous;
    rmSync(dir, { recursive: true, force: true });
  });

  it("applies a quoted value from the file", () => {
    const path = join(dir, ".env");
    writeFileSync(path, 'RPC_URL="https://example.test/?api-key=abc"\n');
    loadProjectEnv(path);
    assert.equal(process.env[KEY], "https://example.test/?api-key=abc");
  });

  it("replaces a value already set in the process", () => {
    process.env[KEY] = "https://stale.example";
    const path = join(dir, ".env");
    writeFileSync(path, "RPC_URL=https://fresh.example\n# comment\n\n");
    loadProjectEnv(path);
    assert.equal(process.env[KEY], "https://fresh.example");
  });

  it("throws when the file is missing", () => {
    const path = join(dir, "missing.env");
    assert.throws(() => loadProjectEnv(path), /No /);
  });
});
