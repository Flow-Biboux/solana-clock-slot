# Helius take-home plan (deadline: about Oct 28, aim to submit Tue Oct 27)

The article is what gets graded. The website and the Percolator finding support it.
If time runs short, cut in this order: website polish, then manual mode, then calendar.
Never cut: real measured numbers, code that runs, your own writing.

## Key correction for everything you write

- The 2x speed-up comes from **SIMD-0525 (reduced slot times)**, not from Alpenglow.
- Alpenglow changed **how `Clock.unix_timestamp` is set** (leader-set, bounded).
- The article covers both because they hit at the same time: "Time on Solana changed twice".

## Percolator: what the public repos show (verify on-chain before you use it)

Source: `github.com/aeyakovenko/percolator-cli` (last commit 2026-06-29),
mainnet "Bounty 7" STOXX/SOL market launched 2026-06-03 (before slots got faster).

| Parameter (README / deploy scripts) | Written as | At 200 ms it means |
|---|---|---|
| `SLOTS_PER_DAY = 216_000n // ~0.4 s/slot` | 1 day | 12 h |
| `force_close_delay_slots` 216,000 | "~24 h" | ~12 h |
| `insurance_withdraw_cooldown_slots` 216,000 | "~24 h" | ~12 h |
| `permissionless_resolve_stale_slots` 6,480,000 | "~30 d" | ~15 d |
| `mark_ewma_halflife_slots` 300 | "~2 min" | ~1 min |
| `maintenance_fee_per_slot` 35 lamports | "~$0.50/day" | ~2x per day |
| `max_staleness_secs` 259,200 | 3 d | **unchanged** (seconds) |

The program code itself uses per-slot parameters by design. The issue is calibration of
the deployed values, not a code bug. The last row is the best teaching example: the same
config mixes slot-based and second-based durations, and only the slot ones changed.

**Before mentioning it anywhere:**
1. Read the live market account on mainnet and confirm the current values
   (market and program addresses are in the percolator-cli README).
2. Open a polite GitHub issue on `aeyakovenko/percolator-cli` (draft below) and wait for
   a reply, or at least 24 h.
3. In the article, describe it neutrally ("an open-source perp market calibrated in June")
   or name it only with the issue link and the maintainer's response.

## Tasks

### Today at your friend's computer (2 to 3 h)
1. Install Solana CLI, Anchor 0.31.1, Node 20+. Get a Helius API key.
2. `anchor keys sync && anchor build && anchor deploy --provider.cluster devnet`
3. Devnet demo (README), save every output to `results/devnet-demo.txt`.
4. Mainnet: `npm run forecast -- --minutes 10 --verify`, run it 3 times at different
   hours, save to `results/mainnet-forecast-1..3.txt`.
5. Percolator check on mainnet (step 1 above), save to `results/percolator-onchain.txt`.
6. Screenshots: terminal with MISMATCH log, checker output, forecast output.

### Saturday
7. Give `docs/CURSOR_PROMPT.md` to Cursor, build the web app (cap: 1 day).
8. Deploy to Vercel at your domain, test with the devnet PDA.
9. Open the Percolator issue (if on-chain values confirmed).

### Sunday
10. Write the article draft yourself (outline below). Send it to me for challenge.

### Monday
11. Edit with my comments. Re-run every code sample from a clean clone.
12. Write the cover note. Put both in Google Docs, comment access.

### Tuesday
13. Final read, submit to evan@helius.xyz with the links (doc, repo, live checker).

## Media to produce

| Asset | How | Used in |
|---|---|---|
| Timeline chart 400 > 350 > 300 > 250 > 200 ms with dates | Simple chart (Excalidraw or Figma) | Article, site |
| "Same config, two units" table (Percolator or generic) | Table in doc | Article |
| Terminal screenshot: `MISMATCH` log | Screenshot | Article |
| Forecast before/after numbers | Screenshot or table | Article |
| Checker screenshot with verdict | Screenshot of live site | Article, cover note |
| 30-60 s screen recording of the checker | Loom or OBS | Social post, cover note |
| Repo README with live results | Already started | GitHub |

## Writing (you write all of it; I review)

### Article outline (~1,500 words)
1. TL;DR (3 bullets, what to check today)
2. What changed: 200 ms slots (SIMD-0525), leader-set Clock (Alpenglow). Primary sources.
3. Three ways time hides in programs: absolute slots, durations in slots, rates per slot.
   Plus the safe one: seconds/timestamps.
4. Demo: the vesting PDA that unlocks early (your devnet numbers).
5. Real world: a config that mixes slots and seconds (Percolator or anonymised).
6. Measure, don't assume: forecast with Helius RPC (your mainnet numbers).
7. What to do: prefer timestamps with tolerance, make slot-time params updatable,
   re-check deploy scripts, read slot duration from the cluster.
8. Try it yourself: link to the checker and the repo. Limits.

### Cover note (half a page max, 4 parts the brief asks for)
- Gap: Helius covers what Alpenglow changes for RPC/streams; nobody covers what the
  slot-time change does to on-chain time logic and deploy parameters.
- Audience: Solana program developers and protocol teams with time-based logic.
- Distribution: specific title and headings matching searches ("Solana 200ms slots
  vesting", "SLOTS_PER_YEAR"), a summary table AI answers can quote, the live checker as a
  shareable link, posts in Solana dev Discords and on X, the Percolator issue as proof.
- Success: checker usage, articles/issues referencing it, teams reporting fixes,
  search impressions, time on page.

### Social post (after you get permission to publish, or keep for later)
3-5 lines: the hook number (e.g. "your 24 h delay is now 12 h"), one screenshot,
link to the checker.

## Percolator issue draft (edit in your own words before posting)

Title: Slot-based parameters calibrated for 400 ms slots (mainnet now 200 ms)

Body:
Mainnet slots moved to 200 ms on 2026-10-09 (SIMD-0525, slot 454,896,000). Several
parameters in the deploy scripts and README were sized with ~0.4 s/slot
(`SLOTS_PER_DAY = 216_000n`), e.g. `force_close_delay_slots` (~24 h, now ~12 h),
`insurance_withdraw_cooldown_slots` (~24 h, now ~12 h), `permissionless_resolve_stale_slots`
(~30 d, now ~15 d), `mark_ewma_halflife_slots` (~2 min, now ~1 min), and
`maintenance_fee_per_slot` (~$0.50/day, now ~2x per day). `max_staleness_secs` is in
seconds and unaffected. On-chain values for the STOXX/SOL market as of <date>: <paste>.
Not sure whether this is intended for the bounty market; flagging in case the
parameters should be re-sized. Happy to help.
