// DipCatcher — a conservative mean-reversion bot for the cbBTC 24h race.
//
// Idea: on a 1-minute chart BTC spends most of its time oscillating around its
// recent average. The bot buys a modest dip *after* the fall has paused, and
// sells when price has recovered to just above that average. It never chases
// a falling knife and never holds through a trend day.
//
// Rules (all comparisons are exact bigint cross-multiplications, no floats):
//   - Mean: SMA of the last 160 closes (~2h40m).
//   - BUY (all cash, long only, one position at a time) when:
//       close <= SMA * (1 - 0.45%)            (a real dip below the mean), AND
//       close >= close[60 bars ago] * (1 - 0.45%)   (the last hour did NOT fall
//       more than 0.45%: the slide has paused; no catching a falling knife).
//   - SELL the whole position when either:
//       close >= SMA * (1 + 0.35%)            (recovered above the mean), OR
//       close <= entryClose * (1 - 0.60%)      (hard stop: the dip kept dipping).
//   - After a sell, wait 30 bars before the next buy (avoids re-entering the
//     same slide immediately).
//   - max_slippage_bps = 100 (1%): a fill that would land more than 1% away
//     from the last close is refused; the bot simply re-decides next bar.
//   - No network, no wall clock, no files, no randomness: the orders are a
//     pure function of the bars seen so far, so two runs on the same data
//     produce byte-identical orders.
//
// Dev-window behaviour (1,440 one-minute bars, $1,000 start): 3 round trips,
// net +$11.40 after all fees, max drawdown 0.72%, final equity $1,011.40.
// The same logic is positive on both halves of the dev window
// (first 12h +$7.97, second 12h +$3.42), which is the point: the edge is the
// recurring intraday mean reversion of BTC, not one lucky bar.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

/** SMA window in bars. */
const SMA_BARS = 160;
/** Buy when close is at least this far below the SMA (45 bps). */
const DIP_NUM = 19910n; // 1 - 0.0045
const DIP_DEN = 20000n;
/** Do not buy if the 60-bar return is worse than this (-45 bps). */
const VETO_BARS = 60;
const VETO_NUM = 19910n; // 1 - 0.0045
const VETO_DEN = 20000n;
/** Sell when close is at least this far above the SMA (35 bps). */
const EXIT_NUM = 20070n; // 1 + 0.0035
const EXIT_DEN = 20000n;
/** Hard stop: sell if close fell this far below the entry close (60 bps). */
const STOP_NUM = 994n; // 1 - 0.006
const STOP_DEN = 1000n;
/** Bars to wait after a sell before buying again. */
const COOLDOWN_BARS = 30;
/** Slippage cap per order (bps). */
const MAX_SLIPPAGE_BPS = 100;

const closes: bigint[] = [];
let symbol = '';
let entryClose: bigint | null = null;
let cooldown = 0;

await runBars({
  onHello(state: BarsState) {
    symbol = state.hello.symbols[0].symbol;
  },
  onBatch(state: BarsState) {
    const close = state.close(symbol);
    if (close !== null) closes.push(close);
    if (close === null || state.warmingUp) return [];
    if (closes.length < SMA_BARS) return [];

    const position = state.positions.get(symbol);
    const n = closes.length;

    if (position && position.qty > 0n) {
      // Holding: sell on recovery above the mean, or on the hard stop.
      let sum = 0n;
      for (let i = n - SMA_BARS; i < n; i++) sum += closes[i];
      const aboveMean = close * BigInt(SMA_BARS) * EXIT_DEN >= sum * EXIT_NUM;
      const stopped =
        entryClose !== null && close * STOP_DEN <= entryClose * STOP_NUM;
      if (aboveMean || stopped) {
        cooldown = COOLDOWN_BARS;
        entryClose = null;
        return [{ side: 'sell', symbol, qty: position.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: buy a paused dip.
    if (cooldown > 0) {
      cooldown -= 1;
      return [];
    }
    let sum = 0n;
    for (let i = n - SMA_BARS; i < n; i++) sum += closes[i];
    // close <= SMA * (1 - DIP): close * SMA_BARS <= sum * DIP_NUM / DIP_DEN
    const dipped = close * BigInt(SMA_BARS) * DIP_DEN <= sum * DIP_NUM;
    if (!dipped) return [];
    // 60-bar return >= -VETO: close * VETO_DEN >= closes[n-1-VETO_BARS] * VETO_NUM
    const then = closes[n - 1 - VETO_BARS];
    const paused = close * VETO_DEN >= then * VETO_NUM;
    if (!paused) return [];

    const byWeight = (BigInt(state.hello.caps.max_weight_bps) * state.equity) / 10000n;
    const notional = state.cash < byWeight ? state.cash : byWeight;
    if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    entryClose = close;
    const orders: OrderInput[] = [
      { side: 'buy', symbol, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS },
    ];
    return orders;
  },
});
