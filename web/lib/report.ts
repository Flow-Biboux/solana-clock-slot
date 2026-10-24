import { PublicKey } from "@solana/web3.js";
import { CLUSTERS, type Cluster } from "./constants";

export const NOTE_MAX_CHARS = 500;
export const REPORT_KINDS = ["pda", "error"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export interface ReportInput {
  kind: ReportKind;
  cluster: Cluster | null;
  verdict: string | null;
  address: string | null;
  program: string | null;
  accountType: string | null;
  note: string | null;
}

export function parseReport(body: unknown): { ok: true; value: ReportInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "JSON object required" };
  const raw = body as Record<string, unknown>;
  if (raw.kind !== "pda" && raw.kind !== "error") return { ok: false, error: "kind must be pda or error" };

  const note = optionalString(raw.note);
  if (note && note.length > NOTE_MAX_CHARS) return { ok: false, error: "note longer than 500 characters" };

  const clusterRaw = optionalString(raw.cluster);
  if (clusterRaw && !CLUSTERS.includes(clusterRaw as Cluster)) {
    return { ok: false, error: "cluster must be mainnet or devnet" };
  }
  const cluster = (clusterRaw as Cluster | null) ?? null;

  const address = optionalString(raw.address);
  if (raw.kind === "pda") {
    if (!address || !isPubkey(address)) return { ok: false, error: "address must be a base58 public key" };
    if (!cluster) return { ok: false, error: "cluster must be mainnet or devnet" };
  } else if (address && !isPubkey(address)) {
    return { ok: false, error: "address must be a base58 public key" };
  }

  const program = optionalString(raw.program);
  if (program && !isPubkey(program)) return { ok: false, error: "program must be a base58 public key" };

  const verdict = optionalString(raw.verdict);
  const accountType = optionalString(raw.accountType);

  return {
    ok: true,
    value: {
      kind: raw.kind,
      cluster,
      verdict,
      address,
      program,
      accountType,
      note,
    },
  };
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isPubkey(value: string): boolean {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

export interface MetricRow {
  kind: string;
  verdict: string | null;
  cluster: string | null;
}

export interface PublicMetrics {
  total: number;
  byKind: Record<string, number>;
  byVerdict: Record<string, number>;
  byCluster: Record<string, number>;
}

export function toPublicMetrics(rows: MetricRow[]): PublicMetrics {
  const byKind: Record<string, number> = {};
  const byVerdict: Record<string, number> = {};
  const byCluster: Record<string, number> = {};
  for (const row of rows) {
    byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
    if (row.verdict) byVerdict[row.verdict] = (byVerdict[row.verdict] ?? 0) + 1;
    if (row.cluster) byCluster[row.cluster] = (byCluster[row.cluster] ?? 0) + 1;
  }
  return { total: rows.length, byKind, byVerdict, byCluster };
}

const PRIVATE_KEYS = new Set(["address", "note", "program", "accountType", "account_type"]);

export function containsPrivateFields(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsPrivateFields);
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => PRIVATE_KEYS.has(key) || containsPrivateFields(nested),
  );
}
