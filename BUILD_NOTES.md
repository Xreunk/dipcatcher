# BUILD_NOTES — DipCatcher (btc-race-24h-20261117-0603)

## Strategy rationale

The dev window (2026-11-16 09:03 UTC → 2026-11-17 09:03 UTC, 1,440 1-minute
cbBTC bars) is a choppy, range-bound day: BTC starts ~$64,461, ends ~$64,776
(+0.49%), with several ~1% swings inside 2-hour blocks and a per-minute
volatility of ~6.4 bps. In that regime:

- **Trend following fails.** Donchian breakouts and EMA crosses were tested
  extensively and lose $15–$46 on the dev window: the breakouts are false
  and every round trip costs ~$2.60 (4 bps fee + 2 bps slippage + ~13 bps
  price impact on a full-size $1,000 order against ~$790k depth), so
  whipsaw is fatal.
- **Plain mean reversion works but is fragile.** Buying 0.6% below a 2h SMA
  and selling back at the mean makes +$5–$6, but the split-half check shows
  it is all from the first half (+$10.16) while the second half loses
  (−$3.77): it buys dips that precede real downtrends.
- **The fix is the veto.** Adding one filter — do not buy when the last
  60 minutes fell more than 0.45% — removes the falling-knife entries. With
  it, both halves of the dev window are positive and the parameter
  neighbourhood is a plateau, not a spike (see below).

Final rule (see `main.ts` for the exact integer arithmetic):

- SMA(160) of closes; buy all cash when `close <= SMA * 0.9955` **and**
  `close >= close[60] * 0.9955`; sell all when `close >= SMA * 1.0035`
  or `close <= entry * 0.994`; 30-bar cooldown after a sell;
  `max_slippage_bps = 100`.

## Dev backtest numbers (official harness)

Command (run twice, identical results):

```
node cli/makefun.mjs grade-local --kit . --bot /path/to/btc-race-01 --driver process --json
```

| metric | value |
|---|---|
| Net PnL | **+$11.400058** |
| Return | +1.14% |
| Trades | 6 (3 round trips, win rate 100%) |
| Fees | $2.412903 |
| Max drawdown | 0.7237% (limit 25%) |
| Final equity | $1,011.40 |
| Exposure | 22.9% of the window |
| 2x-fee sensitivity | still +$8.98 |
| Constraints | compliant (min_trades 1, drawdown OK, no_future_bars) |
| Determinism | `action_log_sha256` cab6ec07924854e132e399a7edf7cdb91510ad11321653f79796b1e028a3ab62, identical on both runs |

Trades (decided bar → fill at next open): buy ~$64,294 → sell ~$64,658
(+$1.85); buy ~$64,111 → sell ~$64,757 (+$6.12); buy ~$64,555 → sell
~$64,997 (+$3.43).

## Robustness checks (local simulator, exact fill model — reproduced the
## official baseline numbers +$1.07 / +$2.45 / $0.00 before searching)

Split-half with indicators recomputed per half (out-of-sample-style):

| parameters | full | first 12h | second 12h |
|---|---|---|---|
| W160 dip 0.45% exit 0.35% veto 60m/−0.45% **(shipped)** | **+$11.40** | +$7.97 | +$3.42 |
| W150 dip 0.45% exit 0.35% veto 60m/−0.45% | +$10.30 | +$6.87 | +$3.42 |
| W150 dip 0.45% exit 0.35% veto 60m/−0.40% | +$10.83 | +$7.40 | +$3.42 |
| W140 dip 0.45% exit 0.35% veto 60m/−0.50% | +$10.72 | +$6.66 | +$4.05 |

The plateau is broad: W 140–160, dip 0.45–0.50%, exit 0.30–0.35%,
veto 0.40–0.50% all give +$8–$12 with both halves positive. The one
sensitive knob is the veto: loosening it to −0.60% lets falling-knife
trades back in and the second half turns −$6 to −$10, so it is kept tight
at −0.45%.

## Baselines compared (official grade-local, same window)

| baseline | net PnL | trades | max DD |
|---|---|---|---|
| momentum (best baseline) | +$2.45 | 1 | 2.12% |
| buy-and-hold | +$1.07 | 1 | 2.12% |
| hold-cash | $0.00 | 0 | 0% |
| rsi-bollinger | −$24.25 | 11 | 2.79% |
| adx-momentum | −$32.66 | 26 | 3.60% |
| ema-cross | −$106.21 | 68 | 10.96% |
| **DipCatcher (shipped)** | **+$11.40** | **6** | **0.72%** |

## Honest limitations

- The edge rests on **3 round trips** in one 24h window. The split-half
  check and the broad parameter plateau give some confidence, but the race
  window is unseen: if it trends hard in one direction with no paused dips,
  the bot may trade little or sit out. The hard stop (−0.60%) and the veto
  bound the downside in that case; max drawdown on dev is 0.72%.
- No position sizing beyond all-in/all-out: with $1,000 capital and ~26 bps
  round-trip cost, splitting into smaller legs would only add fee drag.
- The bot does not use volume, order-book depth beyond the fill model, or
  any cross-asset signal — the universe is a single symbol.
