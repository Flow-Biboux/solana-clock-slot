import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const ACCESS_MESSAGE_MAX = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AccessStatus = "pending" | "approved" | "denied";
export type AccessDecision = "approve" | "deny";

export interface AccessRequestInput {
  email: string;
  name: string;
  message: string | null;
}

export interface AccessRequestRow {
  id: string;
  email: string;
  name: string;
  message: string | null;
  status: AccessStatus;
}

export interface AccessStore {
  getRequest(id: string): Promise<AccessRequestRow | null>;
  setStatus(id: string, status: Exclude<AccessStatus, "pending">): Promise<void>;
  insertGrant(email: string, tokenHash: string, approvedBy: string): Promise<string>;
  deleteGrant(id: string): Promise<void>;
}

export function parseAccessRequest(body: unknown): { ok: true; value: AccessRequestInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "JSON object required" };
  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (name.length < 1 || name.length > 80) return { ok: false, error: "name is required" };
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, error: "email is invalid" };
  if (message.length > ACCESS_MESSAGE_MAX) return { ok: false, error: "message longer than 500 characters" };
  return { ok: true, value: { email, name, message: message.length === 0 ? null : message } };
}

export function hashAccessKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function newAccessKey(): string {
  return randomBytes(32).toString("base64url");
}

export function secretMatches(expected: string | undefined, provided: string | null): boolean {
  if (!expected || !provided) return false;
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(provided).digest();
  return timingSafeEqual(left, right);
}

export async function decideAccess(
  store: AccessStore,
  deliverKey: (to: string, rawKey: string) => Promise<void>,
  id: string,
  decision: AccessDecision,
  approvedBy: string,
): Promise<{ ok: true; key?: string } | { ok: false; error: string }> {
  const request = await store.getRequest(id);
  if (!request || request.status !== "pending") return { ok: false, error: "request is not pending" };
  if (decision === "deny") {
    await store.setStatus(id, "denied");
    return { ok: true };
  }
  const rawKey = newAccessKey();
  const grantId = await store.insertGrant(request.email, hashAccessKey(rawKey), approvedBy);
  try {
    await deliverKey(request.email, rawKey);
  } catch {
    await store.deleteGrant(grantId);
    return { ok: false, error: "could not deliver the key" };
  }
  await store.setStatus(id, "approved");
  return { ok: true, key: rawKey };
}
