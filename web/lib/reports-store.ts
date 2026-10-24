import { createHash, timingSafeEqual } from "crypto";
import { neon } from "@neondatabase/serverless";
import type { AccessRequestRow, AccessStatus, AccessStore } from "./access";
import { hashAccessKey } from "./access";
import type { ReportInput } from "./report";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('pda', 'error')),
  cluster text,
  verdict text,
  address text,
  program text,
  account_type text,
  note text
)`,
  `CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL,
  name text NOT NULL,
  message text,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'denied'))
)`,
  `CREATE TABLE IF NOT EXISTS access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by text NOT NULL
)`,
];

let ready: Promise<void> | null = null;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

async function db() {
  const sql = neon(databaseUrl());
  if (!ready) {
    ready = (async () => {
      for (const statement of STATEMENTS) await sql.query(statement);
    })().catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  await ready;
  return sql;
}

export async function insertReport(report: ReportInput): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO reports (kind, cluster, verdict, address, program, account_type, note)
    VALUES (
      ${report.kind},
      ${report.cluster},
      ${report.verdict},
      ${report.address},
      ${report.program},
      ${report.accountType},
      ${report.note}
    )
  `;
}

export interface StoredReport {
  id: string;
  createdAt: string;
  kind: string;
  cluster: string | null;
  verdict: string | null;
  address: string | null;
  program: string | null;
  accountType: string | null;
  note: string | null;
}

export async function listReports(): Promise<StoredReport[]> {
  const sql = await db();
  const rows = await sql`
    SELECT id, created_at, kind, cluster, verdict, address, program, account_type, note
    FROM reports
    ORDER BY created_at DESC
  `;
  return rows.map((row) => ({
    id: String(row.id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    kind: String(row.kind),
    cluster: row.cluster === null ? null : String(row.cluster),
    verdict: row.verdict === null ? null : String(row.verdict),
    address: row.address === null ? null : String(row.address),
    program: row.program === null ? null : String(row.program),
    accountType: row.account_type === null ? null : String(row.account_type),
    note: row.note === null ? null : String(row.note),
  }));
}

export function metricsKeyMatches(provided: string | null): boolean {
  const expected = process.env.METRICS_KEY;
  if (!expected || !provided) return false;
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(provided).digest();
  return timingSafeEqual(left, right);
}

export function metricsConfigured(): { database: boolean; key: boolean } {
  return { database: Boolean(process.env.DATABASE_URL), key: Boolean(process.env.METRICS_KEY) };
}

export async function hasPendingAccessRequest(email: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`SELECT id FROM access_requests WHERE email = ${email} AND status = 'pending' LIMIT 1`;
  return rows.length > 0;
}

export async function insertAccessRequest(input: { email: string; name: string; message: string | null }): Promise<string> {
  const sql = await db();
  const rows = await sql`
    INSERT INTO access_requests (email, name, message, status)
    VALUES (${input.email}, ${input.name}, ${input.message}, 'pending')
    RETURNING id
  `;
  return String(rows[0]?.id);
}

export async function listPendingAccessRequests(): Promise<AccessRequestRow[]> {
  const sql = await db();
  const rows = await sql`
    SELECT id, email, name, message, status
    FROM access_requests
    WHERE status = 'pending'
    ORDER BY created_at ASC
  `;
  return rows.map(mapAccessRequest);
}

export function accessStore(): AccessStore {
  return {
    async getRequest(id) {
      const sql = await db();
      const rows = await sql`
        SELECT id, email, name, message, status FROM access_requests WHERE id = ${id} LIMIT 1
      `;
      const row = rows[0];
      return row ? mapAccessRequest(row) : null;
    },
    async setStatus(id, status) {
      const sql = await db();
      await sql`UPDATE access_requests SET status = ${status} WHERE id = ${id}`;
    },
    async insertGrant(email, tokenHash, approvedBy) {
      const sql = await db();
      const rows = await sql`
        INSERT INTO access_grants (email, token_hash, approved_by)
        VALUES (${email}, ${tokenHash}, ${approvedBy})
        RETURNING id
      `;
      return String(rows[0]?.id);
    },
    async deleteGrant(id) {
      const sql = await db();
      await sql`DELETE FROM access_grants WHERE id = ${id}`;
    },
  };
}

export async function grantKeyMatches(provided: string | null): Promise<boolean> {
  if (!provided) return false;
  const sql = await db();
  const rows = await sql`SELECT id FROM access_grants WHERE token_hash = ${hashAccessKey(provided)} LIMIT 1`;
  return rows.length > 0;
}

export async function metricsKeyAuthorized(provided: string | null): Promise<boolean> {
  if (metricsKeyMatches(provided)) return true;
  return grantKeyMatches(provided);
}

function mapAccessRequest(row: Record<string, unknown>): AccessRequestRow {
  const status = String(row.status);
  if (status !== "pending" && status !== "approved" && status !== "denied") {
    throw new Error("invalid access status");
  }
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    message: row.message === null || row.message === undefined ? null : String(row.message),
    status: status as AccessStatus,
  };
}
