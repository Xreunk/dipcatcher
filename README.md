# dipcatcher

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Xreunk/dipcatcher/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Xreunk/dipcatcher/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

DipCatcher — a conservative mean-reversion bot that trades cbBTC vs USDC on 1-minute bars. It buys a modest dip after the fall has paused, and sells when price has recovered to just above its recent average. It never chases a falling knife and never holds through a trend day. Dev backtest on the official harness: net PnL **+$11.40** on $1,000 start (gate: > $0), 6 trades, max drawdown 0.72%.

## Run it

```sh
# From the competition kit directory:
node cli/makefun.mjs grade-local --kit . --bot /path/to/dipcatcher --driver process --json
```

## Strategy in plain words

Bitcoin on a 1-minute chart spends most of its time wobbling around its recent average. DipCatcher buys a modest dip **after the fall has paused**, and sells when price has recovered to just above that average.

- **Mean:** simple moving average of the last 160 closes (~2h 40m).
- **Buy** (all cash, long only, one position at a time) when the close is at least 0.45% below the mean **and** the last hour did not fall more than 0.45% (the slide has paused).
- **Sell** the whole position when the close recovers to at least 0.35% above the mean, **or** on a hard stop: 0.60% below the entry close.
- After a sell, wait 30 bars before buying again.
- Orders cap slippage at 100 bps (1%): a fill that would land more than 1% away from the last close is refused and the bot re-decides next bar.

All comparisons are exact integer (bigint) cross-multiplications — no floats, no randomness, no wall clock, no network, no files. The orders are a pure function of the bars seen so far, so two runs on the same data produce byte-identical orders (verified: identical `action_log_sha256` across runs).

## Dev backtest (official harness, `grade-local --driver process`)

| metric | value |
|---|---|
| Net PnL | **+$11.40** (gate: > $0 — passed) |
| Trades | 6 (3 round trips, all 3 won) |
| Fees paid | $2.41 |
| Max drawdown | 0.72% (limit 25%) |
| Final equity | $1,011.40 on $1,000 start |
| Constraints | compliant (≥1 trade, drawdown OK, no future bars) |
| Determinism | identical action log on repeated runs |

For comparison, the best shipped baseline (momentum) makes +$2.45 on the same window; buy-and-hold makes +$1.07.

## Files

- `main.ts` — the bot (Node 22, runs under the kit's `runBars` shim).
- `vendor/makefun-bars.ts` — byte-identical copy of the kit SDK (`bars/sdk/makefun-bars.ts`); the only import.
- `README.md`, `LICENSE` (MIT), `BUILD_NOTES.md`, `STATUS.md`.

The grader runs `node main.ts`; the bot reads NDJSON batches on stdin and writes one reply (an array of orders, possibly empty) per batch on stdout.

---

<sub>Entered on [make.fun](https://make.fun/?ref=penmmk13&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
