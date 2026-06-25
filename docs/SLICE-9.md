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

## Remaining Slice 9 Work

- Per-candle footprint cells (bid/ask split) once trade-level data is available.
- TPO (Time Price Opportunity) profiles.
- Bar Replay across multi-chart layouts.
- Ichimoku cloud rendering (the indicator math already exists in `@tv/ta-lib`).
