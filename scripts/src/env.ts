import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

/** `scripts/src` sits two levels under the repo root, next to `.env`. */
const REPO_ROOT_FROM_SRC = "../..";
const ENV_FILE_NAME = ".env";

export const PROJECT_ENV_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  REPO_ROOT_FROM_SRC,
  ENV_FILE_NAME
);

function isMissingFile(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ENOENT";
}

/**
 * Reads the repo-root `.env` and writes every key onto `process.env`.
 * Keys present in the file replace values already set in the shell, so an
 * old `export RPC_URL=...` cannot hide an edited file.
 */
export function loadProjectEnv(path = PROJECT_ENV_PATH): void {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch (err) {
    if (isMissingFile(err)) {
      throw new Error(`No ${path}. Add RPC_URL to that file.`);
    }
    throw err;
  }

  const parsed: object = parseEnv(content);
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") continue;
    process.env[key] = value;
  }
}
