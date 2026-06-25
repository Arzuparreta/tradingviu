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

## Remaining Slice 9 Work

- Per-candle footprint cells (bid/ask split) once trade-level data is available.
- Bar Replay across multi-chart layouts (single-chart replay shipped in 9e).
- Ichimoku cloud rendering (the indicator math already exists in `@tv/ta-lib`).
