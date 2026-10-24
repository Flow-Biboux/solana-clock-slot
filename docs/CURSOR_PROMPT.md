# Cursor prompt: "Slot Clock Check" web app

Paste everything below the line into Cursor (Agent mode) at the root of the
`solana-clock-slot` repo. Domain and repo URL are filled in. The article URL is the
Google Doc; it is not stored in this repo yet.

---

## Context

Solana mainnet slots went from 400 ms to 200 ms in four steps (SIMD-0525):
350 ms on 2026-08-21 (slot 440,640,000), 300 ms on 2026-08-28 (slot 442,368,000),
250 ms on 2026-09-18 (slot 447,984,000), 200 ms on 2026-10-09 (slot 454,896,000).
The SDK constants (`DEFAULT_TICKS_PER_SECOND / DEFAULT_TICKS_PER_SLOT`) were NOT changed and
still describe 400 ms. Programs and deploy scripts that store time as slots, durations in
slots, or rates per slot were usually calibrated for 400 ms, so they now run about 2x faster
in wall-clock time. Separately, since Alpenglow (2026-10-21, slot 459,653,000)
`Clock.unix_timestamp` is set by the leader within a bound instead of a stake-weighted median.

This repo already contains working, tested logic:
- `scripts/src/clock.ts`: measure real slot duration (`getRecentPerformanceSamples`),
  `getBlockTime` with skipped-slot handling, helpers.
- `scripts/src/check-vesting.ts`: fetch an account, load the Anchor IDL (on-chain or file),
  find the account type by discriminator, decode with `BorshAccountsCoder`, classify fields,
  compare "400 ms assumption" vs "real" dates.
- `programs/time_vesting`: demo Anchor program, IDL in `idl/time_vesting.json`.

Reuse this logic. Do not rewrite the math differently.

## Goal

Build a small web app, deployed on Vercel at `https://solana.biboux.com/safe`,
where a developer pastes an account address and sees
whether its time values are affected by the slot-time change, with a calendar of when
things really happen.

## Stack

- Next.js 15 (App Router), TypeScript strict, Tailwind. pnpm or npm.
- `@coral-xyz/anchor@0.31.1` and `@solana/web3.js@1.98.0`, used ONLY server-side
  (route handlers), so no Buffer polyfills in the browser.
- Vitest for unit tests.
- No database. No auth.

## Security (hard requirements)

- The Helius API key is server-side only: env vars `HELIUS_RPC_MAINNET` and `HELIUS_RPC_DEVNET`.
  Never send it to the client, never log it.
- `/api/*` route handlers call RPC; the browser never calls RPC directly.
- Allowlist RPC methods used: `getAccountInfo`, `getSlot`, `getBlockTime`,
  `getRecentPerformanceSamples`. Nothing that writes.
- Validate every input (base58 pubkey, cluster in {mainnet, devnet}, pasted IDL max 200 KB,
  must parse as JSON with `address`, `accounts`, `types`).
- Simple in-memory rate limit per IP (e.g. 20 requests/min) on `/api/check`.
- Cache `getRecentPerformanceSamples` result for 60 s.

## Features (MVP, in this order)

### 1. Live slot speed panel
- Current average ms/slot on mainnet (and devnet if selected), min/max of recent samples,
  shown next to "400 ms legacy assumption".
- Small timeline of the 4 SIMD-0525 steps above (static data, with source link
  https://solana.com/upgrades/reduced-slot-times).

### 2. Account check (`POST /api/check`)
Input: `{ cluster, address, idl? }`.
1. `getAccountInfo(address)`; owner = program id. 404 message if missing.
2. IDL source, in order: pasted IDL > Anchor on-chain IDL (`Program.fetchIdl`) >
   error "No IDL found: paste the program's IDL JSON".
3. Match the 8-byte discriminator to `idl.accounts`. If no match, return the list of
   account types so the user can pick one (dropdown), then decode with the chosen type.
4. Decode with `BorshAccountsCoder`. Flatten nested structs one level with dotted names.
5. Classify integer fields by name (user can override each in the UI):
   - `absolute_slot`: name contains `slot` and does not end with `_slots`
     and is not a per-slot rate (e.g. `cliff_slot`, `end_slot`, `last_update_slot`).
   - `duration_slots`: name ends with `_slots` or contains `delay_slots`, `stale_slots`,
     `halflife_slots`, `cooldown_slots` (a length of time counted in slots).
   - `rate_per_slot`: name contains `per_slot` (an amount charged/accrued per slot).
   - `timestamp`: `_ts`, `timestamp`, `_time`, `unix`, `_at`.
   - `seconds`: ends with `_secs` or `_seconds` (wall-clock already, NOT affected).
   - otherwise ignored.
6. Compute, using the measured average ms/slot (and min/max for a range):
   - absolute_slot: real date (past: `getBlockTime`, walking forward over skipped slots;
     future: forecast from current slot) vs "intended" date assuming 400 ms from a reference
     slot (a field matching `start|creat|init|open|begin`, else the current slot).
     Delta and "EARLIER/LATER than intended".
   - duration_slots: wall-clock length at 400 ms vs at real speed (e.g. 216,000 slots:
     24 h then, 12 h now).
   - rate_per_slot: per-day total at 400 ms (216,000 slots/day) vs at real speed
     (86,400,000 / avgMs slots/day). Show the raw unit; don't assume a token or price.
   - timestamp: show date; note "not affected by slot speed; since Alpenglow set by leader
     within a bound".
   - seconds: show as duration; "not affected".
7. Verdict: `AFFECTED` if any slot-based field exists and real speed is >5% off 400 ms;
   `NOT AFFECTED BY SLOT SPEED` if only timestamp/seconds fields; `NO TIME FIELDS FOUND`.
   Always show: "Heuristic, not an audit. It reads account data, not program logic."

### 3. Manual mode (no IDL needed)
For programs without an Anchor IDL (custom layouts). User picks a type
(absolute slot / duration in slots / rate per slot) and enters a number. Same math,
computed client-side from the speed returned by `GET /api/speed`.

### 4. Calendar
For every future absolute date shown: "Add to Google Calendar" link and `.ics` download
(generate client-side, one VEVENT per date, title `"<field> (real, slot <n>)"`, description
includes the 400 ms date and the uncertainty range).

### 5. Shareable URL
`/safe?cluster=mainnet&address=...` pre-fills and runs the check. Pasted IDLs are not put in
the URL.

### 6. Page content around the tool
- Title: "Did your program's clock just double speed?"
- 3-line explanation, link to the article (Google Doc — URL not in the repo yet), link to the GitHub repo
  (https://github.com/Flow-Biboux/solana-clock-slot), link to SIMD-0525 and the Solana Foundation pages.
- "Try it" button that fills the devnet demo PDA from the README.
- Limits section (copy from README "Limits").
- Responsible disclosure note: "If you find an affected live protocol, contact its team
  before posting about it."
- Footer: "Data via Helius RPC".

## Design
Clean, single column, readable on mobile, dark/light via `prefers-color-scheme`.
Monospace for slots and addresses. Verdict as a colored badge. No animations needed.

## Tests (must pass before deploy)
- Unit: classification of field names (table-driven, include `cliff_slot`, `end_slot`,
  `force_close_delay_slots`, `maintenance_fee_per_slot`, `max_staleness_secs`, `cliff_ts`,
  `mark_ewma_halflife_slots`).
- Unit: math for each kind with avgMs = 200 and 400 (e.g. 216,000 duration slots = 12 h at
  200 ms; rate 35/slot = 7,560,000/day at 400 ms and 15,120,000/day at 200 ms).
- Unit: decode a `Vesting` account encoded with `BorshAccountsCoder` from
  `idl/time_vesting.json`, check fields are classified and dates computed.
- Unit: `.ics` output is valid (BEGIN:VCALENDAR, VEVENT, DTSTART in UTC).
- Manual e2e: devnet demo PDA returns AFFECTED with cliff/end EARLIER.

## Deliverables
- `web/` folder (Next.js app), README section "Web app" with env vars and deploy steps.
- Do not modify `programs/` or `scripts/` except to export shared helpers if needed.
- Commit in small steps with clear messages.
