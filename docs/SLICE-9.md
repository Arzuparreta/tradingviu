# Slice 9 — Advanced TA

Slice 9 is the advanced technical-analysis layer: candlestick pattern recognition,
auto chart patterns, volume footprint, TPO, and bar replay.

## 9a — Candlestick Pattern Recognition

Status: done.

Delivered:

- `packages/candlestick-patterns`: a pure, deterministic pattern engine over OHLCV
  bars. No time, randomness, or I/O — detection is a function of the bar array, so
  results are reproducible and unit-testable.
- 22 patterns across three families:
  - **Single-bar:** Doji, Bullish/Bearish Marubozu, Spinning Top, Hammer, Hanging Man,
    Inverted Hammer, Shooting Star.
  - **Two-bar:** Bullish/Bearish Engulfing, Bullish/Bearish Harami, Piercing Line,
    Dark Cloud Cover, Tweezer Bottom/Top.
  - **Three-bar:** Morning Star, Evening Star, Three White Soldiers, Three Black Crows,
    Three Inside Up/Down.
- **Trend-aware disambiguation:** shape-identical patterns that mean opposite things by
  context (Hammer vs Hanging Man, Inverted Hammer vs Shooting Star) are split by a
  deterministic `priorTrend` classifier over the bars preceding the pattern.
- A pattern catalog (`allPatterns`) with id, name, kind, direction, span, and a
  one-line description; `findPattern(id)`; and a `detectAll(bars, { ids? })` scanner that
  returns every match in bar order with `{ id, name, kind, direction, index, startIndex, time }`.
- `GET /api/patterns` (catalog) and `POST /api/patterns/scan` (`{ symbol, interval, limit, ids? }`)
  in `apps/server/src/routes/patterns.ts`. Scan fetches bars through the same CCXT
  provider path as `/api/indicators/compute`, runs `detectAll`, and returns matches.
- A `createMarkers` helper in `packages/chart-engine` (wrapping lightweight-charts'
  `createSeriesMarkers`) and a **Patterns** toggle on `ChartPage` that overlays markers
  on the candle series: green up-arrows below the bar for bullish, red down-arrows above
  for bearish, neutral circles otherwise, each labelled with the pattern's initials.
- Deterministic `bun test` suite (`packages/candlestick-patterns/src/patterns.test.ts`)
  covering every detector with hand-crafted bars, plus the registry and scanner.

Notes:

- Multiple patterns can complete on the same bar; the scanner returns each separately and
  the chart stacks the markers.
- Detection requires no DB migration and no new env vars — it reads the same historical
  bars the chart already fetches.
- Real-data caveat: gap-dependent patterns (Morning/Evening Star) fire rarely on 24/7
  crypto feeds that seldom gap; the star condition uses the prior body midpoint rather than
  a strict price gap so they still surface when the structure is present.

## 9b — Auto Chart-Pattern Detection

Status: done.

Delivered:

- `packages/chart-patterns`: a pure, deterministic chart-pattern engine over OHLCV
  bars. Like the candlestick engine, detection is a function of the bar array — no
  time, randomness, or I/O — so results are reproducible and unit-testable. Unlike
  candlestick patterns (fixed width, single completing bar), chart patterns span a
  variable window of swing pivots and only fire once price **confirms** them by
  breaking the relevant trendline.
- **Swing-pivot foundation:** `findPivots(bars, lookback)` detects local highs/lows
  (strictly the extreme within `±lookback`), and `alternatePivots` collapses
  same-kind runs into a strictly alternating high/low sequence that the detectors
  consume.
- 11 patterns across two families:
  - **Reversals:** Double Top, Double Bottom, Triple Top, Triple Bottom,
    Head & Shoulders, Inverse Head & Shoulders. Necklines may slope (H&S projects
    the trough line to the breakout bar); flat necklines (double/triple) use the
    trough/peak level.
  - **Continuations:** Ascending Triangle, Descending Triangle, Symmetrical Triangle
    (direction taken from the breakout), Rising Wedge, Falling Wedge.
- Each match carries the structural `points` in chronological order (pivots →
  breakout), the `breakoutLevel`, a measured-move `target`, a deterministic
  `confidence` in `[0, 1]` (from level equality / line convergence), and the
  start/end indices and times.
- A catalog (`allChartPatterns`) with id, name, direction, category, and a one-line
  description; `findChartPattern(id)`; and a `scanChartPatterns(bars, { ids?, ... })`
  scanner that computes pivots once, runs every detector, and returns matches in
  breakout order.
- `GET /api/chart-patterns` (catalog) and `POST /api/chart-patterns/scan`
  (`{ symbol, interval, limit, ids? }`) in `apps/server/src/routes/chart-patterns.ts`.
  Scan fetches bars through the same CCXT provider path as `/api/patterns/scan`,
  runs `scanChartPatterns`, and returns matches.
- A **Chart Patterns** toggle on `ChartPage` that draws each detected pattern as a
  dashed polyline through its structural points (colored by direction) on the candle
  chart, plus a results panel listing each pattern's direction, category, breakout
  level, target, and confidence.
- Deterministic `bun test` suite (`packages/chart-patterns/src/chart-patterns.test.ts`)
  covering pivot detection, every detector with hand-crafted zig-zags, the catalog,
  the id filter, breakout ordering, and the no-false-positive-on-flat-noise case.

Notes:

- Confirmation requires a real breakout, not just the structure, which keeps false
  positives low; un-confirmed (still-forming) patterns are intentionally not returned.
- Multiple patterns can confirm in the same window (e.g. a double top inside a triple
  top, or a symmetrical triangle alongside a wedge); each is returned separately and
  the chart stacks the shapes.
- Detection requires no DB migration and no new env vars — it reads the same
  historical bars the chart already fetches.

## 9c — Volume Profile

Status: done.

Delivered:

- `packages/volume-profile`: a pure, deterministic volume-at-price engine over
  OHLCV bars. Like the pattern engines, detection is a function of the bar array
  and the bin/value-area settings only — no time, randomness, or I/O — so results
  are reproducible and unit-testable.
- **Volume distribution model:** the price range `[min low, max high]` is split
  into `bins` horizontal rows; each bar's volume is spread across the rows its
  `[low, high]` range overlaps, **proportional to the overlap** (a tall bar seeds
  many rows, a doji one). Volume is split into a buy/sell estimate from where the
  bar **closed inside its own range** (`buyFraction` — close at the high → all
  buying, at the low → all selling, flat bar leans on open→close direction), so a
  per-row and aggregate `delta = buy − sell` falls out without any tick/bid-ask
  tape. Degenerate inputs (single flat price, zero-volume bars) collapse safely.
- **Profile statistics:** total / buy / sell volume and delta; the **Point of
  Control** (POC — highest-volume row); and the **Value Area** (VAH/VAL — the
  contiguous band of rows around the POC holding `valueAreaPct`, default 70%, of
  total volume, grown one row at a time toward whichever neighbour carries more
  volume, ties expanding up). Each row reports its price bounds, buy/sell/total
  volume, delta, and `isPoc` / `inValueArea` flags.
- `computeVolumeProfile(bars, { bins?, valueAreaPct? })` returning a fully
  Zod-described `VolumeProfile`, plus `buyFraction` / `overlap` helpers.
- `POST /api/volume-profile` (`{ symbol, interval, limit, bins?, valueAreaPct? }`)
  in `apps/server/src/routes/volume-profile.ts`. It fetches bars through the same
  CCXT provider path as `/api/chart-patterns/scan`, runs `computeVolumeProfile`,
  and returns the profile.
- A **Volume Profile** toggle on `ChartPage` that overlays the POC (solid amber),
  VAH and VAL (dashed grey) as horizontal price lines on the candle series, plus a
  side panel with a stacked buy/sell SVG histogram (value-area rows tinted, POC row
  flagged) and POC / value-area / total-volume / delta stats.
- Deterministic `bun test` suite (`packages/volume-profile/src/volume-profile.test.ts`)
  covering the buy/sell split, volume conservation, POC selection, value-area growth,
  the degenerate single-price case, schema validity, and run-to-run determinism.

Notes:

- The buy/sell split is an OHLCV-only estimate; with no real tape it is a heuristic,
  not exchange-reported aggressor volume. It is consistent and deterministic, which
  is what the delta column is for.
- Computation requires no DB migration and no new env vars — it reads the same
  historical bars the chart already fetches.

## 9d — TPO Profile (Market Profile)

Status: done.

Delivered:

- `packages/tpo-profile`: a pure, deterministic Time-Price-Opportunity (Market
  Profile) engine over OHLCV bars. Like the volume-profile engine, it is a
  function of the bar array and the bin / value-area / period settings only —
  no time, randomness, or I/O — so results are reproducible and unit-testable.
- **Period model:** bars are grouped into equal-size periods of `barsPerPeriod`
  consecutive bars (default 1); each period merges its bars' `[low, high]` range
  and is assigned a Market Profile letter (`A`–`Z`, then `a`–`z`, then wrapping).
  Every period prints its letter at **every price row its range spans**, so a
  row's `count` is the number of distinct periods that traded through it — the
  classic letter ladder, in contrast to volume profile's volume-weighted rows.
- **Profile statistics:** total TPO count; the **Point of Control** (POC — the
  most-printed row); the **Value Area** (VAH/VAL — the contiguous band of rows
  around the POC holding `valueAreaPct`, default 70%, of all TPOs, grown one row
  at a time toward the heavier neighbour, ties expanding up); the **Initial
  Balance** (IBH/IBL — the price range of the first one or two periods); and
  **single prints** (rows touched by exactly one period). Each row reports its
  price bounds, TPO count, the letters that printed there, and `isPoc` /
  `inValueArea` / `isSinglePrint` flags. Degenerate inputs (single flat price)
  collapse to one row safely.
- `computeTpoProfile(bars, { bins?, valueAreaPct?, barsPerPeriod? })` returning a
  fully Zod-described `TpoProfile`, plus a `periodLabel` helper.
- `POST /api/tpo-profile` (`{ symbol, interval, limit, bins?, valueAreaPct?,
  barsPerPeriod? }`) in `apps/server/src/routes/tpo-profile.ts`. It fetches bars
  through the same CCXT provider path as `/api/volume-profile`, runs
  `computeTpoProfile`, and returns the profile.
- A **TPO** toggle on `ChartPage` that overlays the POC (solid cyan), VAH/VAL
  (dashed grey), and the Initial Balance high/low (dotted indigo) as horizontal
  price lines on the candle series, plus a side panel with the Market Profile
  letter ladder (value-area rows tinted, POC row flagged cyan, single prints in
  amber) and POC / value-area / initial-balance / single-print stats. The client
  defaults to 240 bars at 10 bars/period → 24 periods (`A`–`X`) for a readable
  ladder.
- Deterministic `bun test` suite (`packages/tpo-profile/src/tpo-profile.test.ts`)
  covering the letter convention, per-period row counting, POC selection, value
  area growth, single prints + initial balance, `barsPerPeriod` grouping, the
  degenerate single-price case, schema validity, and run-to-run determinism.

Notes:

- TPO counts *periods*, not volume, so the same window can read differently from
  the volume profile (a price visited by many short periods ranks high even with
  little volume). The two are complementary views.
- Letters wrap after 52 periods; the row `count` stays authoritative, which is
  why the client defaults to a period count that keeps the ladder legible.
- Computation requires no DB migration and no new env vars — it reads the same
  historical bars the chart already fetches.

## 9e — Bar Replay

Status: done.

Delivered:

- A **Bar Replay** mode on `ChartPage` that reveals historical bars one at a
  time, so a user can step through past price action and practice as if trading
  live. It reuses the existing paginated history (`useChartHistory`) — no new
  endpoint.
- `apps/web/src/lib/replay.ts`: a pure, React-free helper module with the index
  and timing math (`replayStepMs` speed→cadence, `clampIndex`,
  `defaultReplayIndex`, `isReplayAtEnd`, and a binary-search `indexAtOrBefore`
  for click-to-set-start). Unit-tested in `apps/web/test/replay.test.ts`.
- **Controls:** a Replay toggle plus step-back (`⏮`), play/pause (`▶`/`⏸`),
  step-forward (`⏭`), a speed selector (0.5×–10×), and a position readout
  (`cursor/total`). Clicking any bar on the chart sets the replay start point.
- **Correctness:**
  - The live WS stream and left-scroll pagination are both paused while replay
    is active (replay owns the candle/volume series), and resume on exit.
  - Candles/volume render the sliced window via `setData`, following the cursor
    with `scrollToRealTime` so the newest revealed bar stays at the right edge.
  - Time-keyed overlays are clipped to the cursor's time: causal **indicators**
    (lines + bands), **candlestick markers**, and **chart-pattern** polylines
    only show what had formed by the replay cursor. Because indicators are
    causal, slicing the precomputed series by `time <= cursor` is exactly their
    value "as of" that bar — no recompute needed.
  - Switching symbol or interval leaves replay so the cursor index stays valid.
- Deterministic `bun test` suite for the replay math (speeds, clamping, default
  cursor, end detection, and the at-or-before search) — the `ChartPage`
  mount-regression test continues to pass with the replay wiring in place.

Notes:

- `setInterval` is shadowed inside `ChartPage` by the timeframe state setter
  (`const [interval, setInterval] = useState(...)`), so the playback loop calls
  `window.setInterval` / `window.clearInterval` explicitly.
- Window-aggregate overlays (Volume Profile, TPO) are not re-scoped to the
  replay window in this slice — they remain explicit toggles computed over the
  fetched history. Per-window replay recompute can come later.

## 9f — Ichimoku Cloud

Status: done.

Delivered:

- `packages/ichimoku`: a pure, deterministic Ichimoku Kinkō Hyō engine over
  OHLCV bars. Computes Tenkan-sen, Kijun-sen, Senkou Span A/B, and Chikou Span,
  with the leading spans **displaced forward** `displacement` bars (default 26)
  and the lagging span displaced back. Beyond the last bar, the forward times
  are synthesized from the smallest positive bar step, so the cloud projects
  ahead exactly like TradingView. The `cloud` array aligns Span A/B on each
  (future) time with a `bullish` flag (A ≥ B). Pure: a function of the bars and
  periods only.
- A **cloud (kumo) primitive** in `@tv/chart-engine` (`createIchimokuCloud`): a
  lightweight-charts `ISeriesPrimitive` attached to the candle series that fills
  the band between Span A and Span B in a bitmap-space canvas renderer — green
  where A ≥ B, red where A < B — splitting the fill at each **twist** (the A/B
  crossover, where the band has zero width) and drawing at `zOrder: 'bottom'` so
  it sits beneath the candles. Exposes `setData` / `remove`.
- `POST /api/ichimoku` (`{ symbol, interval, limit, tenkan?, kijun?, senkou?,
  displacement? }`) in `apps/server/src/routes/ichimoku.ts`, fetching bars
  through the same CCXT provider path as `/api/volume-profile`.
- An **Ichimoku** toggle on `ChartPage` that draws the five lines (Tenkan blue,
  Kijun orange, Senkou A green, Senkou B red, Chikou purple) plus the kumo. The
  span line series carry the forward-displaced times so the time scale can place
  the projected cloud. In Bar Replay every series and the cloud are clipped to
  the cursor time.
- Deterministic `bun test` suite (`packages/ichimoku/src/ichimoku.test.ts`)
  covering Tenkan/Kijun/Senkou math, forward/back displacement and future-time
  synthesis, cloud span alignment + the bullish flag, a bearish case, the
  default-displacement rule, the empty input, schema validity, and determinism.

Notes:

- The legacy `ichimoku` entry in `@tv/ta-lib` only produced Tenkan/Kijun through
  the single-`points` generic indicator contract, which can't express five
  displaced series plus a filled band. 9f supersedes it with the dedicated
  engine + cloud primitive (the established slice-9 overlay pattern).
- Forward-displaced leading spans extend the time scale into the future, so the
  chart shows empty space to the right with the projected cloud — the authentic
  Ichimoku look.
- Computation requires no DB migration and no new env vars.

## 9g — Bar Replay across multi-chart layouts

Status: done.

Delivered:

- Multi-chart Bar Replay on `LayoutPage`: a single replay control steps **every
  panel together**. Because panels can hold different symbols and intervals, the
  sync is by **cursor time**, not bar index — each panel reveals only its bars
  with `time <= cursor`, so charts on different timeframes stay aligned to the
  same moment.
- **Global time domain:** each `ChartPanel` reports its loaded `{ min, max, step }`
  time bounds up via a new `onBounds` callback; `LayoutPage` unions them into a
  global span (finest step wins) and drives the shared cursor over it. Panels
  with no symbol are ignored, and the Replay button is disabled until at least
  one panel has bars.
- **Controls:** Replay toggle, step-back/play-pause/step-forward, a speed
  selector (0.5×–10×), and the live cursor timestamp. The cadence reuses the
  same `replayStepMs` mapping as single-chart replay.
- **Correctness:** while replay is active the per-panel live WebSocket stream is
  disabled (the active panel's `live` is gated on `!replayActive`), each panel
  follows the cursor with `scrollToRealTime`, and the view only re-fits on a
  symbol/interval change (not on every step). The cursor is clamped into the
  domain as panels load or the grid reflows.
- New pure, React-free time helpers in `apps/web/src/lib/replay.ts` (`clampTime`,
  `defaultReplayTime`, `isTimeAtEnd`) with deterministic `bun` tests, reused by
  the layout's play loop and stepping.

Notes:

- Crosshair sync (existing) and replay are independent: you can scrub the replay
  cursor and still mirror the crosshair across panels.
- The per-chart overlays (indicators, patterns, profiles, Ichimoku) live on the
  single-chart `ChartPage`; the layout panels are price/volume only, so
  multi-chart replay reveals candles + volume in lockstep.

## 9h — Pivot Points

Status: done.

Delivered:

- `packages/pivot-points`: a pure, deterministic pivot engine over OHLCV bars.
  Bars are grouped into calendar **D / W / M** periods (UTC; weeks anchored to
  Monday), and each current period's levels are derived from the **prior**
  period's range. Five methods:
  - **Standard** (PP, R1–R3, S1–S3), **Fibonacci** (0.382 / 0.618 / 1.0 of the
    range), **Camarilla** (R1–R4 / S1–S4 off the close), **Woodie** (folds in
    the current period's open), and **DeMark** (single PP/R1/S1, switching on
    prior close vs open).
  - Output is the per-period `sets` (each with its prior-period basis HLOC and
    named `levels`) plus `latest` — today's pivots — or null when there isn't a
    prior period yet.
- `computePivotPoints(bars, { method?, period? })` returning a Zod-described
  `PivotPoints`.
- `POST /api/pivot-points` (`{ symbol, interval, limit, method, period }`) in
  `apps/server/src/routes/pivot-points.ts`, fetching bars through the same CCXT
  provider path as the other overlays.
- A **Pivots** toggle on `ChartPage` with method + period selectors that draws
  the latest period's levels as horizontal price lines (PP amber/solid,
  resistances red, supports green, dashed) plus a side panel listing the levels
  top-down and the prior-period H/L/C basis.
- Deterministic `bun test` suite (`packages/pivot-points/src/pivots.test.ts`)
  covering period grouping + basis, the textbook formulas for all five methods
  (hand-computed), weekly Monday-boundary grouping, the single-period and empty
  cases, schema validity, and determinism.

Notes:

- Levels are computed from completed prior periods, so the latest set is stable
  for the whole current period — exactly how floor-trader pivots are used.
- No DB migration and no new env vars — it reads the same historical bars the
  chart already fetches.

## Slice 9 status

Slices **9a–9h are done**. The only remaining item — **per-candle footprint
cells** (true bid/ask aggressor split) — is **deferred**: it needs trade-level
(tick) data, which the current OHLCV provider path does not expose. It will be
picked up when a trade-tape source lands. With that one data-blocked exception,
Slice 9 (advanced TA) is complete.
