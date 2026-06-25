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

## 11b — Backtest Pine signal series

Status: done.

Delivered:

- The backtest core is split into a pure **`simulate(bars, signals, settings)`**
  (the position/fill/equity/stats loop over a precomputed `{-1, 0, 1}` signal
  array) and **`runBacktest(bars, strategy, settings)`** (generate a built-in
  strategy's signals, then `simulate`). The result's `strategy` is now optional —
  present for built-ins, absent for raw signal simulations.
- **`signalsFromSeries(series)`** maps an arbitrary numeric series to signals by
  sign: positive → long, negative → short, zero / null / NaN → flat.
- **`POST /api/backtest/pine`** (`{ symbol, interval, limit, source, inputs?,
  signalPlot?, settings }`): runs the Pine script through the existing
  `compileAndRun`, reads a **signal plot** (the plot titled `signal`
  case-insensitively, else the first plot), maps it to positions, and simulates.
  It returns the chosen `signalPlot`, the list of plot titles, and the
  `BacktestResult`, and reports Pine parse/runtime errors like `/api/pine/run`.
  This reuses the existing vectorized Pine interpreter as-is — no event-driven
  `strategy.entry`/`exit` engine is required.
- The **Pine editor** (`PineEditorPage`) gains a **⚗ Backtest** button and an
  *allow-shorts* toggle next to Run, plus a result panel under the charts: the
  signal plot used, an equity-curve sparkline, and headline stats (net profit vs
  buy & hold, win rate, profit factor, max drawdown, Sharpe, exposure).
- Engine tests extended: `simulate` over a raw signal array (no strategy
  attached, exact P&L) and `signalsFromSeries` sign mapping.

Notes:

- **Convention:** a script is backtested by the sign of a plotted series — name
  it `signal` (e.g. `plot(fast > slow ? 1 : -1, title="signal")`). An overlay
  signal plot will rescale the price pane, so put the signal in a non-overlay
  script (or accept the squashed candles) when you want a clean chart too.
- This is signal-based, not order-based: it covers crossover/threshold
  strategies cleanly. True `strategy.entry`/`exit` semantics (stops, targets,
  pyramiding) would need a bar-by-bar interpreter mode — a later step.

## 11c — Parameter optimization

Status: done.

Delivered:

- **`optimize(bars, type, paramGrid, settings, opts)`** in `@tv/backtest-engine`:
  a pure, deterministic grid search. It builds the cartesian product of the
  candidate values in `paramGrid`, runs a full `runBacktest` for each
  combination, and ranks them **best-first** by `objective`
  (`netProfitPct` | `sharpe` | `profitFactor` | `winRate` | `maxDrawdownPct`),
  via a single higher-is-better score (drawdown negated; a null profit factor
  sinks). Evaluation is capped at `maxCombos` (reported through `truncated`) and
  only the top `topN` rows are returned. The sort is stable, so ties keep grid
  order — fully reproducible.
- `OptimizeResult` (Zod-described): `type`, `objective`, `evaluated`,
  `truncated`, and `results` (each row = `{ params, stats }`).
- **`POST /api/backtest/optimize`** (`{ symbol, interval, limit, type,
  paramGrid, settings, objective, maxCombos?, topN? }`): fetches bars once and
  runs the optimizer.
- In the **ChartPage** backtest panel: an objective selector and an **Optimize
  parameters** button that sweeps the current strategy's params with a coarse
  auto-grid (~7 evenly-spaced values per param, snapped to each param's step, so
  ≤ 3 params stay within `maxCombos`), then shows a ranked top-12 table (one
  column per param + net %, win %, profit factor, max drawdown). Clicking a row
  applies that combination to the single-run controls.
- Engine tests cover full-grid evaluation, best-first ranking matching a direct
  backtest, the `maxDrawdownPct` (minimize) objective, `maxCombos` truncation +
  `topN`, schema validity, and determinism.

Notes:

- The auto-grid is intentionally coarse (it's a fast scan, not exhaustive); the
  API accepts arbitrary explicit grids for finer sweeps.
- This is a single in-sample grid search — walk-forward / out-of-sample
  validation is the natural next step.

## Remaining Slice 11 Work

- Event-driven Pine `strategy.*` (stops / targets / trailing exits, pyramiding).
- A dedicated backtest report page with a trade list and drawdown chart.
- Walk-forward / out-of-sample optimization.
