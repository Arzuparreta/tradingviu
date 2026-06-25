# Slice 11 — Strategy Backtesting

Slice 11 turns the strategy story (Pine + paper trading) into a measurable one: a
deterministic backtester that runs a strategy over historical bars and reports
how it would have performed.

## 11a — Backtest engine + built-in strategies

Status: done.

Delivered:

- `packages/backtest-engine`: a **pure, deterministic** strategy simulator over
  OHLCV bars. Like the other analysis engines it is a function of the bars,
  strategy, and settings only — no time, randomness, or I/O — so results are
  reproducible and unit-testable.
- **Three built-in strategies** (`generateSignals`), each emitting a causal
  desired position in `{-1, 0, 1}` from data up to the current bar:
  - **MA Cross** — long when the fast SMA is above the slow SMA, short/flat below.
  - **RSI Reversal** — long below the oversold band, short/flat above the
    overbought band (Wilder's RSI).
  - **Donchian Breakout** — long on a close above the prior-N high, short/flat on
    a close below the prior-N low.
- **No look-ahead:** the signal computed at bar *i* is executed at bar *i+1*'s
  **open**. Positions are sized as `positionPct` of current equity; entries and
  exits pay `feeBps` commission and cross `slippageBps` of slippage. With
  `allowShort: false` a bearish signal simply flattens. Any open position is
  force-closed at the last bar.
- **Full result:** the round-trip `trades` (side, entry/exit, qty, net P&L,
  return %, bars held, exit reason), a per-bar `equityCurve`, and a `stats`
  block — net profit (abs + %), buy & hold return, total/winning/losing trades,
  win rate, gross profit/loss, profit factor, avg/avg-win/avg-loss/largest
  trade, max drawdown (abs + %), long/short counts, avg bars held, exposure, and
  a per-bar Sharpe of the equity curve. Invariant: `netProfit == Σ trade.pnl`
  and `finalEquity == initialCapital + netProfit`.
- `runBacktest(bars, strategy, settings)` returning a fully Zod-described
  `BacktestResult`, plus a `strategyCatalog` (label, description, tunable param
  defs) for the API + UI.
- `POST /api/backtest` (`{ symbol, interval, limit, strategy, settings }`) in
  `apps/server/src/routes/backtest.ts`, fetching bars through the same CCXT
  provider path as the other analysis routes, plus
  `GET /api/backtest/strategies` for the catalog.
- A **Backtest** toggle on `ChartPage`: pick a strategy, tune its params and the
  account settings (capital, fee, slippage, position size, allow-shorts), Run,
  and see entry/exit **markers** on the candle chart (a separate markers plugin
  from the candlestick-pattern overlay, replay-cursor aware) plus a side panel
  with an **equity-curve sparkline** and the headline stats (net profit vs buy &
  hold, trades, win rate, profit factor, max drawdown, Sharpe, exposure).
- Deterministic `bun test` suite (`packages/backtest-engine/src/backtest.test.ts`)
  covering the SMA/RSI helpers, signal generation per strategy, an **exact
  single-trade P&L** (no fees/slippage), the fees/slippage reduction, the
  `netProfit == Σ trade.pnl` invariant, determinism, short suppression, the empty
  input, schema validity, and the catalog.

Notes:

- Sharpe is reported per bar (mean / stddev of bar returns), not annualized —
  the engine is interval-agnostic. The route could pass `periodsPerYear` later to
  annualize.
- Strategies are signal-based built-ins; wiring the Pine runtime's strategy
  output into the same simulator is a natural follow-up (the engine already
  consumes a `{-1,0,1}` signal array).
- Computation requires no DB migration and no new env vars — it reads the same
  historical bars the chart already fetches.

## Remaining Slice 11 Work

- Backtest arbitrary Pine strategies (feed `strategy.*` calls into the simulator).
- Stops / targets / trailing exits and pyramiding.
- A dedicated backtest report page with a trade list and drawdown chart.
- Walk-forward / parameter optimization.
