import { describe, expect, it } from "vitest";
import { decideAccess, hashAccessKey, parseAccessRequest, type AccessRequestRow, type AccessStore } from "@/lib/access";
import { containsPrivateFields, toPublicMetrics } from "@/lib/report";

function memoryStore(initial: AccessRequestRow): AccessStore & { grants: { id: string; email: string; tokenHash: string }[]; status: string } {
  const grants: { id: string; email: string; tokenHash: string }[] = [];
  let status = initial.status;
  return {
    grants,
    get status() {
      return status;
    },
    async getRequest() {
      return { ...initial, status };
    },
    async setStatus(_id, next) {
      status = next;
    },
    async insertGrant(email, tokenHash) {
      const id = `grant-${grants.length + 1}`;
      grants.push({ id, email, tokenHash });
      return id;
    },
    async deleteGrant(id) {
      const index = grants.findIndex((grant) => grant.id === id);
      if (index >= 0) grants.splice(index, 1);
    },
  };
}

describe("parseAccessRequest", () => {
  it("rejects a bad email and a message over 500 characters", () => {
    expect(parseAccessRequest({ name: "Ada", email: "not-an-email" }).ok).toBe(false);
    expect(parseAccessRequest({ name: "Ada", email: "ada@example.com", message: "x".repeat(501) }).ok).toBe(false);
  });
});

describe("decideAccess", () => {
  const pending: AccessRequestRow = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "ada@example.com",
    name: "Ada",
    message: null,
    status: "pending",
  };

  it("delivers the raw key once and stores only its hash", async () => {
    const store = memoryStore(pending);
    let mailed = "";
    const result = await decideAccess(store, async (_to, rawKey) => {
      mailed = rawKey;
    }, pending.id, "approve", "telegram");
    expect(result.ok).toBe(true);
    expect(store.grants).toHaveLength(1);
    expect(store.grants[0]?.tokenHash).toBe(hashAccessKey(mailed));
    expect(store.grants[0]?.tokenHash).not.toBe(mailed);
    expect(store.status).toBe("approved");
  });

  it("does not create a grant when the request is denied", async () => {
    const store = memoryStore(pending);
    const result = await decideAccess(store, async () => undefined, pending.id, "deny", "telegram");
    expect(result.ok).toBe(true);
    expect(store.grants).toHaveLength(0);
    expect(store.status).toBe("denied");
  });

  it("removes the grant when delivery fails", async () => {
    const store = memoryStore(pending);
    const result = await decideAccess(store, async () => {
      throw new Error("smtp down");
    }, pending.id, "approve", "telegram");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("could not deliver the key");
    expect(store.grants).toHaveLength(0);
    expect(store.status).toBe("pending");
  });
});

describe("public metrics", () => {
  it("still omits addresses and notes", () => {
    const summary = toPublicMetrics([{ kind: "pda", verdict: "AFFECTED", cluster: "mainnet" }]);
    expect(containsPrivateFields({ summary })).toBe(false);
  });
});
