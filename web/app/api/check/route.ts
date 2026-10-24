import { NextResponse } from "next/server";
import { AnchorProvider, BorshAccountsCoder, Program, type Idl } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { classifyFieldName, type FieldKind } from "@/lib/classify";
import { CLUSTERS, IDL_MAX_BYTES, LEGACY_MS_PER_SLOT, type Cluster } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";
import { blockTimeNear, cachedSlotSpeed, connectionFor } from "@/lib/rpc";
import { forecastUnix, intendedUnix, verdict } from "@/lib/time-math";

export const dynamic = "force-dynamic";

const INT_TYPES = new Set(["u16", "u32", "u64", "u128", "i16", "i32", "i64", "i128"]);
const START_NAME = /(start|creat|init|open|begin)/i;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

function isIdl(value: unknown): value is Idl {
  if (!value || typeof value !== "object") return false;
  const idl = value as Record<string, unknown>;
  return typeof idl.address === "string" && Array.isArray(idl.accounts) && Array.isArray(idl.types);
}

export async function POST(request: Request) {
  if (!rateLimit(clientIp(request))) {
    return NextResponse.json({ error: "Rate limit: 20 checks per minute" }, { status: 429 });
  }
  let body: { cluster?: string; address?: string; idl?: unknown; accountType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  if (!body.cluster || !CLUSTERS.includes(body.cluster as Cluster)) {
    return NextResponse.json({ error: "cluster must be mainnet or devnet" }, { status: 400 });
  }
  let address: PublicKey;
  try {
    address = new PublicKey(body.address ?? "");
  } catch {
    return NextResponse.json({ error: "address must be a base58 public key" }, { status: 400 });
  }
  if (body.idl !== undefined) {
    const encoded = JSON.stringify(body.idl);
    if (encoded.length > IDL_MAX_BYTES) {
      return NextResponse.json({ error: "IDL larger than 200 KB" }, { status: 400 });
    }
    if (!isIdl(body.idl)) {
      return NextResponse.json({ error: "IDL must be JSON with address, accounts, and types" }, { status: 400 });
    }
  }

  const cluster = body.cluster as Cluster;
  try {
    const conn = connectionFor(cluster);
    const info = await conn.getAccountInfo(address);
    if (!info) return NextResponse.json({ error: "Account not found on this cluster" }, { status: 404 });

    let idl: Idl | null = body.idl && isIdl(body.idl) ? body.idl : null;
    if (!idl) {
      const wallet = {
        publicKey: Keypair.generate().publicKey,
        signTransaction: async <T,>(tx: T) => tx,
        signAllTransactions: async <T,>(txs: T[]) => txs,
      };
      idl = await Program.fetchIdl(info.owner, new AnchorProvider(conn, wallet, {}));
    }
    if (!idl) {
      return NextResponse.json({ error: "No IDL found: paste the program's IDL JSON" }, { status: 422 });
    }

    const names = (idl.accounts ?? []).map((account) => account.name);
    const disc = info.data.subarray(0, 8);
    const matched = (idl.accounts ?? []).find((account) => Buffer.from(account.discriminator).equals(disc));
    const chosenName = body.accountType ?? matched?.name;
    if (!chosenName || !names.includes(chosenName)) {
      return NextResponse.json({ error: "Pick an account type", accountTypes: names }, { status: 409 });
    }

    const decoded = new BorshAccountsCoder(idl).decode(chosenName, info.data) as Record<string, unknown>;
    const typeDef = (idl.types ?? []).find((type) => type.name === chosenName);
    if (!typeDef || typeDef.type.kind !== "struct" || !Array.isArray(typeDef.type.fields)) {
      return NextResponse.json({ error: `Type ${chosenName} is not a named struct` }, { status: 422 });
    }
    const structFields = (typeDef.type.fields as unknown as { name?: string; type: unknown }[]).filter(
      (field): field is { name: string; type: unknown } => typeof field.name === "string",
    );

    const fields = flattenFields(structFields, decoded);
    const speed = await cachedSlotSpeed(cluster, conn);
    const slot = await conn.getSlot("confirmed");
    const now = await blockTimeNear(conn, slot, -1);
    const slotFields = fields.filter((field) => field.kind === "absolute_slot");
    const start = slotFields.find((field) => START_NAME.test(field.name));
    const ref = start
      ? { slot: start.value, ts: (await realTime(conn, start.value, now, speed.avgMs)).ts, label: start.name }
      : { slot: now.slot, ts: now.ts, label: "current slot" };

    const analyzed = [];
    for (const field of fields) {
      if (field.kind === "ignored") continue;
      analyzed.push(await describeField(conn, field, ref, now, speed));
    }

    return NextResponse.json({
      address: address.toBase58(),
      program: info.owner.toBase58(),
      accountType: chosenName,
      accountTypes: names,
      speed,
      legacyMs: LEGACY_MS_PER_SLOT,
      now,
      ref,
      fields: analyzed,
      verdict: verdict(analyzed.map((field) => field.kind), speed.avgMs),
      note: "Heuristic, not an audit. It reads account data, not program logic.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "check failed";
    return NextResponse.json({ error: message.replace(/api-key=[^&\s]+/gi, "api-key=redacted") }, { status: 502 });
  }
}

interface FlatField {
  name: string;
  value: number;
  kind: FieldKind;
}

function flattenFields(defs: { name: string; type: unknown }[], decoded: Record<string, unknown>): FlatField[] {
  const out: FlatField[] = [];
  for (const def of defs) {
    const raw = decoded[def.name];
    if (raw && typeof raw === "object" && typeof def.type === "object" && def.type && "defined" in def.type) {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const num = Number(String(value));
        if (!Number.isFinite(num)) continue;
        out.push({ name: `${def.name}.${key}`, value: num, kind: classifyFieldName(key) });
      }
      continue;
    }
    if (typeof def.type !== "string" || !INT_TYPES.has(def.type)) continue;
    const num = Number(String(raw));
    if (!Number.isFinite(num)) continue;
    out.push({ name: def.name, value: num, kind: classifyFieldName(def.name) });
  }
  return out;
}

async function realTime(
  conn: ReturnType<typeof connectionFor>,
  slot: number,
  now: { slot: number; ts: number },
  avgMs: number,
): Promise<{ ts: number; how: string }> {
  if (slot <= now.slot) {
    const found = await blockTimeNear(conn, slot, 1);
    return { ts: found.ts, how: "observed" };
  }
  return { ts: forecastUnix(now.ts, now.slot, slot, avgMs), how: "forecast" };
}

async function describeField(
  conn: ReturnType<typeof connectionFor>,
  field: FlatField,
  ref: { slot: number; ts: number; label: string },
  now: { slot: number; ts: number },
  speed: { avgMs: number; minMs: number; maxMs: number },
) {
  if (field.kind === "absolute_slot") {
    const intended = intendedUnix(ref.ts, ref.slot, field.value);
    const real = await realTime(conn, field.value, now, speed.avgMs);
    const minTs = forecastUnix(now.ts, now.slot, field.value, speed.minMs);
    const maxTs = forecastUnix(now.ts, now.slot, field.value, speed.maxMs);
    const gap = intended - real.ts;
    return {
      ...field,
      intended,
      real: real.ts,
      how: real.how,
      direction: gap >= 0 ? "EARLIER" : "LATER",
      range: [Math.min(minTs, maxTs), Math.max(minTs, maxTs)],
    };
  }
  if (field.kind === "duration_slots") {
    return {
      ...field,
      legacySecs: (field.value * LEGACY_MS_PER_SLOT) / 1000,
      realSecs: (field.value * speed.avgMs) / 1000,
    };
  }
  if (field.kind === "rate_per_slot") {
    return {
      ...field,
      legacyPerDay: field.value * (86_400_000 / LEGACY_MS_PER_SLOT),
      realPerDay: field.value * (86_400_000 / speed.avgMs),
    };
  }
  return { ...field };
}
