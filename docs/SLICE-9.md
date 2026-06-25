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

## Remaining Slice 9 Work

- Auto chart-pattern detection (head & shoulders, double top/bottom, triangles).
- Volume Footprint (candle-by-candle volume-at-price distribution).
- TPO (Time Price Opportunity) profiles.
- Bar Replay across multi-chart layouts.
- Ichimoku cloud rendering (the indicator math already exists in `@tv/ta-lib`).
