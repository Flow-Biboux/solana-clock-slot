"use client";

import { useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/constants";
import type { PublicMetrics } from "@/lib/report";

interface AccessRequest {
  id: string;
  email: string;
  name: string;
  message: string | null;
  status: string;
}

interface DetailRow {
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

export default function MetricsPage() {
  const [summary, setSummary] = useState<PublicMetrics | null>(null);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [reports, setReports] = useState<DetailRow[] | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [issuedKey, setIssuedKey] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [askName, setAskName] = useState("");
  const [askEmail, setAskEmail] = useState("");
  const [askMessage, setAskMessage] = useState("");
  const [askStatus, setAskStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE_PATH}/api/metrics`)
      .then(async (response) => {
        const body = (await response.json()) as { summary?: PublicMetrics; error?: string };
        if (!response.ok) throw new Error(body.error ?? "metrics failed");
        if (!cancelled && body.summary) setSummary(body.summary);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "metrics failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadDetails() {
    setError("");
    const response = await fetch(`${BASE_PATH}/api/metrics`, { headers: { "x-metrics-key": key } });
    const body = (await response.json()) as {
      summary?: PublicMetrics;
      reports?: DetailRow[];
      requests?: AccessRequest[];
      error?: string;
    };
    if (!response.ok) {
      setReports(null);
      setRequests([]);
      setError(body.error ?? "detail failed");
      return;
    }
    if (body.summary) setSummary(body.summary);
    setReports(body.reports ?? []);
    setRequests(body.requests ?? []);
  }

  async function decide(id: string, decision: "approve" | "deny") {
    setError("");
    const response = await fetch(`${BASE_PATH}/api/access/decide`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-metrics-key": key },
      body: JSON.stringify({ id, decision }),
    });
    const body = (await response.json()) as { error?: string; key?: string | null };
    if (!response.ok) {
      setError(body.error ?? "decision failed");
      return;
    }
    setIssuedKey(body.key ?? "");
    await loadDetails();
  }

  async function requestAccess() {
    setAskStatus("");
    const response = await fetch(`${BASE_PATH}/api/access/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: askName, email: askEmail, message: askMessage }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setAskStatus(body.error ?? "request failed");
      return;
    }
    setAskStatus("Request sent.");
    setAskName("");
    setAskEmail("");
    setAskMessage("");
    setAskOpen(false);
  }

  return (
    <main>
      <p className="muted">
        <a href={`${BASE_PATH}/`}>Back to the checker</a>
      </p>
      <h1>Report metrics</h1>
      <p>Counts only. Addresses and notes stay off this public view.</p>
      {error ? <p className="error">{error}</p> : null}
      {summary ? (
        <section className="card">
          <p>{summary.total} reports</p>
          <h2>By kind</h2>
          <CountList counts={summary.byKind} />
          <h2>By verdict</h2>
          <CountList counts={summary.byVerdict} />
          <h2>By cluster</h2>
          <CountList counts={summary.byCluster} />
        </section>
      ) : (
        <p className="muted">Loading counts…</p>
      )}
      <section className="card">
        <button type="button" className="secondary" onClick={() => setAskOpen(!askOpen)}>
          Request access
        </button>
        {askOpen ? (
          <div>
            <label>
              Name
              <input value={askName} onChange={(event) => setAskName(event.target.value)} />
            </label>
            <label>
              Email
              <input value={askEmail} onChange={(event) => setAskEmail(event.target.value)} />
            </label>
            <label>
              Message, optional
              <textarea value={askMessage} maxLength={500} onChange={(event) => setAskMessage(event.target.value)} />
            </label>
            <div className="row">
              <button type="button" onClick={() => void requestAccess()}>
                Submit request
              </button>
            </div>
          </div>
        ) : null}
        {askStatus ? <p className="muted">{askStatus}</p> : null}
      </section>
      <section className="card">
        <h2>Operator detail</h2>
        <label>
          Metrics key
          <input type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" />
        </label>
        <div className="row">
          <button type="button" onClick={() => void loadDetails()}>
            Show recent reports
          </button>
        </div>
        {reports ? (
          <ul>
            {reports.map((report) => (
              <li key={report.id} className="mono">
                {report.createdAt} {report.kind} {report.cluster ?? ""} {report.verdict ?? ""} {report.address ?? ""}{" "}
                {report.program ?? ""} {report.note ?? ""}
              </li>
            ))}
          </ul>
        ) : null}
        {issuedKey ? <p className="mono">Key, also sent to Telegram: {issuedKey}</p> : null}
        {requests.length > 0 ? (
          <div>
            <h2>Pending access requests</h2>
            <ul>
              {requests.map((request) => (
                <li key={request.id}>
                  {request.name} · {request.email} {request.message ?? ""}
                  <div className="row">
                    <button type="button" onClick={() => void decide(request.id, "approve")}>
                      Approve
                    </button>
                    <button type="button" onClick={() => void decide(request.id, "deny")}>
                      Deny
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function CountList({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return <p className="muted">None yet.</p>;
  return (
    <ul>
      {entries.map(([name, count]) => (
        <li key={name}>
          {name}: {count}
        </li>
      ))}
    </ul>
  );
}
