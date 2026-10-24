"use client";

import { useEffect, useMemo, useState } from "react";
import { BASE_PATH, LEGACY_MS_PER_SLOT, SIMD_STEPS, SPEED_POLL_MS } from "@/lib/constants";
import { classifyFieldName, type FieldKind } from "@/lib/classify";
import { buildIcs, googleCalendarUrl, type CalendarEvent } from "@/lib/ics";
import { durationSecs, ratePerDay, verdict } from "@/lib/time-math";

interface SpeedResponse {
  cluster: string;
  legacyMs: number;
  speed: { avgMs: number; minMs: number; maxMs: number; samples: number };
  source: string;
}

interface FieldResult {
  name: string;
  value: number;
  kind: FieldKind;
  intended?: number;
  real?: number;
  how?: string;
  direction?: string;
  range?: [number, number];
  legacySecs?: number;
  realSecs?: number;
  legacyPerDay?: number;
  realPerDay?: number;
}

interface CheckResponse {
  address: string;
  program: string;
  accountType: string;
  accountTypes: string[];
  fields: FieldResult[];
  verdict: string;
  note: string;
  speed: SpeedResponse["speed"];
  error?: string;
}

function ReportBox({
  label,
  open,
  note,
  status,
  onOpen,
  onNote,
  onSubmit,
}: {
  label: string;
  open: boolean;
  note: string;
  status: string;
  onOpen: () => void;
  onNote: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <button type="button" className="secondary" onClick={onOpen}>
        {label}
      </button>
      {open ? (
        <div>
          <label>
            Note, optional
            <textarea value={note} maxLength={500} onChange={(event) => onNote(event.target.value)} />
          </label>
          <div className="row">
            <button type="button" onClick={onSubmit}>
              Submit report
            </button>
          </div>
        </div>
      ) : null}
      {status ? <p className="muted">{status}</p> : null}
    </div>
  );
}

function iso(unix?: number): string {
  if (unix === undefined) return "";
  return new Date(unix * 1000).toISOString().replace(".000Z", "Z");
}

export default function Page() {
  const [cluster, setCluster] = useState("mainnet");
  const [address, setAddress] = useState("");
  const [idl, setIdl] = useState("");
  const [accountType, setAccountType] = useState("");
  const [speed, setSpeed] = useState<SpeedResponse | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [manualKind, setManualKind] = useState<FieldKind>("absolute_slot");
  const [manualValue, setManualValue] = useState("");
  const [reportOpen, setReportOpen] = useState<"pda" | "error" | null>(null);
  const [reportNote, setReportNote] = useState("");
  const [reportStatus, setReportStatus] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextCluster = params.get("cluster");
    const nextAddress = params.get("address");
    if (nextCluster === "mainnet" || nextCluster === "devnet") setCluster(nextCluster);
    if (nextAddress) setAddress(nextAddress);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSpeed() {
      try {
        const response = await fetch(`${BASE_PATH}/api/speed?cluster=${cluster}`);
        const body = (await response.json()) as SpeedResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "speed failed");
        if (!cancelled) setSpeed(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "speed failed");
      }
    }
    void loadSpeed();
    const timer = setInterval(() => void loadSpeed(), SPEED_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cluster]);

  async function sendReport(kind: "pda" | "error") {
    setReportStatus("");
    const response = await fetch(`${BASE_PATH}/api/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        cluster,
        address: kind === "pda" ? address : undefined,
        program: kind === "pda" ? result?.program : undefined,
        accountType: kind === "pda" ? result?.accountType : undefined,
        verdict: kind === "pda" ? result?.verdict : undefined,
        note: reportNote,
      }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setReportStatus(body.error ?? "report failed");
      return;
    }
    setReportStatus("Sent. Thank you.");
    setReportNote("");
    setReportOpen(null);
  }

  async function runCheck(typeName = accountType) {
    setPending(true);
    setError("");
    try {
      const payload: { cluster: string; address: string; idl?: unknown; accountType?: string } = { cluster, address };
      if (idl.trim()) payload.idl = JSON.parse(idl) as unknown;
      if (typeName) payload.accountType = typeName;
      const response = await fetch(`${BASE_PATH}/api/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as CheckResponse & { error?: string; accountTypes?: string[] };
      if (response.status === 409 && body.accountTypes) {
        setAccountType(body.accountTypes[0] ?? "");
        setError("No discriminator match. Pick an account type and run again.");
        setResult(null);
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "check failed");
      setResult(body);
      const url = new URL(window.location.href);
      url.searchParams.set("cluster", cluster);
      url.searchParams.set("address", address);
      window.history.replaceState(null, "", url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "check failed");
    } finally {
      setPending(false);
    }
  }

  const events: CalendarEvent[] = useMemo(() => {
    return (result?.fields ?? [])
      .filter((field) => field.kind === "absolute_slot" && field.real && field.real * 1000 > Date.now())
      .map((field) => ({
        field: field.name,
        slot: field.value,
        realUnix: field.real ?? 0,
        intendedIso: iso(field.intended),
        range: field.range ? `${iso(field.range[0])} .. ${iso(field.range[1])}` : "",
      }));
  }, [result]);

  const manual = Number(manualValue);
  const avg = speed?.speed.avgMs ?? LEGACY_MS_PER_SLOT;

  return (
    <main>
      <p className="muted">safu.biboux.com</p>
      <h1>Did your program&apos;s clock just double speed?</h1>
      <p>
        Mainnet slots went from 400 ms to 200 ms (SIMD-0525). Programs that stored time as slots still assume 400 ms,
        so those deadlines now arrive about twice as soon. Since Alpenglow, <span className="mono">Clock.unix_timestamp</span> is
        set by the leader within a bound.
      </p>
      <p className="links">
        <a href="https://solana.com/upgrades/reduced-slot-times">Article</a>
        <a href="https://github.com/Flow-Biboux/solana-slot-clock">GitHub</a>
        <a href="https://solana.com/upgrades/reduced-slot-times">SIMD-0525</a>
      </p>

      <section className="card">
        <h2>Live slot speed</h2>
        <p className="mono speed">
          {cluster}: {speed ? `${speed.speed.avgMs.toFixed(1)} ms` : "loading"} (min {speed?.speed.minMs.toFixed(1) ?? "—"} / max{" "}
          {speed?.speed.maxMs.toFixed(1) ?? "—"}) · legacy assumption {LEGACY_MS_PER_SLOT} ms
        </p>
        <ul>
          {SIMD_STEPS.map((step) => (
            <li key={step.slot}>
              {step.date}: {step.ms} ms at slot <span className="mono">{step.slot.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Account check</h2>
        <label>
          Cluster
          <select value={cluster} onChange={(event) => setCluster(event.target.value)}>
            <option value="mainnet">mainnet</option>
            <option value="devnet">devnet</option>
          </select>
        </label>
        <label>
          Account address
          <input className="mono" value={address} onChange={(event) => setAddress(event.target.value.trim())} placeholder="base58 pubkey" />
        </label>
        <label>
          IDL JSON (optional, max 200 KB)
          <textarea className="mono" value={idl} onChange={(event) => setIdl(event.target.value)} />
        </label>
        {result?.accountTypes ? (
          <label>
            Account type
            <select value={accountType} onChange={(event) => setAccountType(event.target.value)}>
              {result.accountTypes.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="row">
          <button type="button" disabled={pending} onClick={() => void runCheck()}>
            {pending ? "Checking…" : "Check"}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {result ? (
          <div>
            <p>
              <span className={`badge ${result.verdict === "AFFECTED" ? "AFFECTED" : result.verdict.startsWith("NOT") ? "NOT" : "NONE"}`}>
                {result.verdict}
              </span>
            </p>
            <p className="mono">
              {result.accountType} · {result.program}
            </p>
            {result.fields.map((field) => (
              <article className="field" key={field.name}>
                <p className="mono">
                  {field.name} = {field.value} · {field.kind}
                </p>
                {field.kind === "absolute_slot" ? (
                  <p>
                    400 ms: {iso(field.intended)} · real: {iso(field.real)} ({field.how}) · {field.direction}
                  </p>
                ) : null}
                {field.kind === "duration_slots" ? (
                  <p>
                    {field.legacySecs?.toFixed(0)} s at 400 ms · {field.realSecs?.toFixed(0)} s now
                  </p>
                ) : null}
                {field.kind === "rate_per_slot" ? (
                  <p>
                    {field.legacyPerDay?.toLocaleString("en-US")} /day at 400 ms · {field.realPerDay?.toLocaleString("en-US")} /day now
                  </p>
                ) : null}
                {field.kind === "timestamp" ? <p>{iso(field.value)}. Not affected by slot speed; since Alpenglow set by the leader within a bound.</p> : null}
                {field.kind === "seconds" ? <p>{field.value} seconds. Not affected.</p> : null}
              </article>
            ))}
            <p className="muted">{result.note}</p>
            {result.verdict === "AFFECTED" ? (
              <ReportBox
                label="Report this account"
                open={reportOpen === "pda"}
                note={reportNote}
                status={reportStatus}
                onOpen={() => setReportOpen(reportOpen === "pda" ? null : "pda")}
                onNote={setReportNote}
                onSubmit={() => void sendReport("pda")}
              />
            ) : null}
            {events.length > 0 ? (
              <div>
                {events.map((event) => (
                  <p key={event.field}>
                    <a href={googleCalendarUrl(event)}>Add {event.field} to Google Calendar</a>
                  </p>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([buildIcs(events)], { type: "text/calendar" });
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(blob);
                    link.download = "slot-clock.ics";
                    link.click();
                  }}
                >
                  Download .ics
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Manual mode</h2>
        <label>
          Kind
          <select value={manualKind} onChange={(event) => setManualKind(event.target.value as FieldKind)}>
            <option value="absolute_slot">absolute slot</option>
            <option value="duration_slots">duration in slots</option>
            <option value="rate_per_slot">rate per slot</option>
          </select>
        </label>
        <label>
          Number
          <input className="mono" value={manualValue} onChange={(event) => setManualValue(event.target.value)} />
        </label>
        {Number.isFinite(manual) ? (
          <p className="mono">
            {manualKind === "duration_slots"
              ? `${durationSecs(manual, LEGACY_MS_PER_SLOT)} s at 400 ms, ${durationSecs(manual, avg).toFixed(1)} s at ${avg.toFixed(1)} ms`
              : manualKind === "rate_per_slot"
                ? `${ratePerDay(manual, LEGACY_MS_PER_SLOT)} /day at 400 ms, ${ratePerDay(manual, avg).toFixed(1)} /day now`
                : `delta vs 400 ms depends on a reference slot; use Account check for dates`}
          </p>
        ) : null}
        <p className="muted">Verdict preview for this one field: {verdict([classifyFieldName(manualKind === "absolute_slot" ? "cliff_slot" : manualKind === "duration_slots" ? "delay_slots" : "fee_per_slot")], avg)}</p>
      </section>

      <section>
        <h2>Limits</h2>
        <ul>
          <li>This reads account data, not program logic. It cannot know how a program converted durations into slots.</li>
          <li>Field detection is by name. Override by renaming is not available; the kind shown is the heuristic.</li>
          <li>IDL decoding needs an on-chain IDL or a pasted IDL JSON. Pasted IDLs are not put in the URL.</li>
          <li>If you find an affected live protocol, contact its team before posting about it.</li>
        </ul>
        <p className="muted">
          Data via Helius RPC · <a href={`${BASE_PATH}/metrics`}>Report metrics</a>
        </p>
      </section>
      <div className="bug-dock">
        {reportOpen === "error" ? (
          <div className="card bug-panel">
            <label>
              Note, optional
              <textarea value={reportNote} maxLength={500} onChange={(event) => setReportNote(event.target.value)} />
            </label>
            <div className="row">
              <button type="button" onClick={() => void sendReport("error")}>
                Submit report
              </button>
            </div>
            {reportStatus ? <p className="muted">{reportStatus}</p> : null}
          </div>
        ) : null}
        <button type="button" className="bug-fab" onClick={() => setReportOpen(reportOpen === "error" ? null : "error")}>
          Report a bug
        </button>
      </div>
    </main>
  );
}
