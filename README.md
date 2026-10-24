# solana-slot-clock

Demo code for: "Time on Solana changed twice: what to check in your program".

Since October 2026, mainnet slots last 200 ms (SIMD-0525), but the SDK constants
(`DEFAULT_TICKS_PER_SECOND / DEFAULT_TICKS_PER_SLOT`) still describe 400 ms slots.
Any program that turns a duration into a number of slots with that assumption now
reaches its deadline about twice as fast in real time.

## Contents

| Path | What it does |
|---|---|
| `programs/time_vesting` | Anchor program. Creates a vesting PDA that stores the same schedule as slots (400 ms assumption) and as Unix timestamps. `check_cliff` logs `MISMATCH` when the two disagree. Holds no tokens. |
| `scripts/src/forecast.ts` | Measures the real slot duration from RPC and forecasts the slot at now + N minutes, vs the 400 ms assumption. `--verify` waits and measures the error. |
| `scripts/src/check-vesting.ts` | Points at any Anchor account, finds `*_slot` and `*_ts` fields, and prints when each slot really happens vs when a 400 ms assumption says it should. Heuristic, not an audit. |
| `scripts/src/create-vesting.ts` | Creates the demo PDA on devnet. |
| `scripts/src/check-cliff.ts` | Simulates `check_cliff` and prints the program logs. |

## Setup

```bash
# Program (Anchor 0.31.1)
anchor keys sync          # writes your own program id into lib.rs and Anchor.toml
anchor build
anchor deploy --provider.cluster devnet   # also publishes the IDL on-chain

# you might need to cret=ate yourself a keypair
# solana-keygen new -o /home/<ROOT>/.config/solana/id.json

# Scripts
cd scripts
npm install
# repo-root .env (one level above scripts/) is loaded on startup and overrides the shell:
#   RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
```

## Demo (devnet, about 10 minutes)

```bash
# 1. Cliff in 10 min, end in 20 min. The slot cliff is computed as 600 s / 0.4 s = 1500 slots.
npm run create -- --cliff-secs 600 --duration-secs 1200

# 2. Run this every minute or so. Around minute 5 the slot cliff is reached,
#    the timestamp cliff is not: the program logs MISMATCH until minute 10.
npm run check-cliff

# 3. Read the PDA from outside and see the drift
npm run check -- --account <VESTING_PDA>
```

## Same demo on a local validator with 200 ms slots (no devnet needed)

```bash
anchor build
solana-test-validator --reset --ticks-per-slot 32 \
  --upgradeable-program <PROGRAM_ID> target/deploy/time_vesting.so ~/.config/solana/id.json
# 32 ticks at 160 ticks/s = 200 ms slots, like mainnet since Oct 9 2026

anchor idl init --filepath target/idl/time_vesting.json <PROGRAM_ID> --provider.cluster localnet 
# point repo-root .env at the validator: RPC_URL=http://127.0.0.1:8899
cd scripts
npm run create -- --cliff-secs 60 --duration-secs 120
npm run check-cliff        # run again ~35 s later: MISMATCH
npm run check -- --account <VESTING_PDA>
```

Output from that run (Oct 22 2026, Agave 2.2.20 test validator):

```
Program log: slot=309 ts=1792693925 cliff_by_slot=true cliff_by_time=false
Program log: MISMATCH: slot-based and time-based schedules disagree

cliff_slot = 260
  if slots were 400 ms:  2026-10-22T18:32:24Z
  at real speed:         2026-10-22T18:31:55Z (observed)
  -> EARLIER than intended by 29s
end_slot = 410
  if slots were 400 ms:  2026-10-22T18:33:24Z
  at real speed:         2026-10-22T18:32:26Z (forecast)
  -> EARLIER than intended by 58s

Forecast for +1 min
  real speed     slot 659
  legacy 400 ms  slot 518  -> off by 141 slots
Actual slot at target time: ~662
  real-speed forecast error   -3 slots (~-0.6 s)
  legacy forecast error       -144 slots (~-29.7 s)
```

## Mainnet measurement

```bash
# repo-root .env: RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
npm run forecast -- --minutes 10 --verify
```

## Build notes

- `Cargo.lock` is pinned so `cargo-build-sbf` (platform tools with Cargo 1.84) can build it:
  Anchor crates at 0.31.1, `blake3` 1.8.2, `proc-macro2` 1.0.95. `.cargo/config.toml` makes the
  resolver pick versions compatible with Rust 1.84.
- If `anchor build` / `anchor idl build` fails with `cannot find value 'beneficiary' in this scope`
  on a recent Rust, build the IDL with:
  `CARGO_ENCODED_RUSTFLAGS="-Awarnings" RUSTUP_TOOLCHAIN=stable anchor idl build -p time_vesting -o target/idl/time_vesting.json`
- The `bigint: Failed to load bindings` line printed by the scripts is a harmless web3.js warning.

## Web app

Test interface: `https://safu.biboux.com` (`web/`, Next.js, served at the domain root).

```bash
cd web
npm install
npm test
# server-side only, never sent to the browser:
# HELIUS_RPC_MAINNET=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
# HELIUS_RPC_DEVNET=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
# DATABASE_URL comes from the Vercel Neon integration
# METRICS_KEY is the operator token for /metrics detail rows
# TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
npm run dev
```

On Vercel, set the project root to `web/`, add the Helius URLs, connect Neon so `DATABASE_URL` is injected, set `METRICS_KEY`, and attach `safu.biboux.com`. The Next app also reads the repo-root `.env` at startup. Public `/metrics` shows counts. The detail list is returned only when `METRICS_KEY` or an approved personal key is sent as the `x-metrics-key` header.

Anyone can submit "Request access" on that page. A Telegram message to `TELEGRAM_CHAT_ID` has Approve and Deny buttons. Approving posts the new key in that same chat. You copy it and send it yourself. Someone who already has a key can approve the next request from the metrics page.

After deploy, register the bot webhook once. Do not log the bot token:

`https://api.telegram.org/bot<token>/setWebhook?url=https://safu.biboux.com/api/telegram`

## Limits

- `check-vesting` reads account data, not program logic. It cannot know how a program
  converted durations into slots; it shows what the dates would be if it used 400 ms.
- Field detection is by name (`*_slot`, `*_ts`, `*_time`, `*timestamp*`).
- IDL decoding needs an on-chain IDL or `--idl path/to/idl.json`.
- Do not publish claims about third-party protocols from this tool without checking
  their source code and contacting the team first.
