# Slice 2 — Indicators + Live bars + Watchlists

Commit: `39a6465`

> Historical note: the live-bar polling design below was superseded by slice 2.5. Current Binance charts use native REST/WS bars plus live quote/depth fanout.

## What it delivered

### TA library (`packages/ta-lib`)

31 technical indicators in pure TypeScript, Zod-validated parameters, sensible defaults, and a registry for discovery:

- **Overlap (7):** SMA, EMA, WMA, VWAP, Bollinger Bands, Keltner Channels, Donchian Channels
- **Momentum (9):** RSI, MACD, Stochastic, CCI, ROC, Williams %R, MFI, AO, Ultimate Oscillator
- **Volatility (6):** ATR, True Range, Bollinger Width, StdDev, Historical Volatility, Ulcer Index
- **Volume (5):** OBV, CMF, AD, PVT, NVI
- **Trend (5):** ADX, Aroon, PSAR, Supertrend, Ichimoku

All indicators are pure functions: `(bars, params) => IndicatorOutput`. Output has `points`, `bands` (for BB/KC/DC), and `histogram` (for MACD).

15 unit tests cover all indicators, MACD signals/histogram, BB bands, defaults, and Zod validation.

### Live bars via WebSocket (`apps/server/src/services/ws.ts`)

- Native Bun.serve with WebSocket upgrade at `/ws`
- Auth via Bearer token in query string (e.g., `wss://host/ws?token=<jwt>`)
- Per-connection subscription tracking with cleanup on disconnect
- CCXT-based provider subscribe (polling fallback at 1s for exchanges that don't support `watchOHLCV`)
- Broadcast fanout: when a new bar arrives for a symbol, all clients subscribed to that symbol receive it
- WebSocket protocol defined in `packages/core/src/ws-protocol.ts` as a Zod discriminated union

### Watchlists CRUD

- DB tables already existed from slice 1 (`watchlists`, `watchlist_items`) with RLS policies
- API endpoints: create, list, delete watchlists; add/remove symbols with optional note/color
- Web UI at `/watchlists`: create new list, browse items, add/remove symbols, navigate to chart
- All operations respect multi-tenant RLS (tenant A never sees tenant B's watchlists)

### Chart UI improvements (`apps/web/src/pages/ChartPage.tsx`)

- Interval selector: 1m, 5m, 15m, 1h, 4h, 1d, 1w
- Indicator dropdown to add overlay indicators on-the-fly
- Multi-pane rendering: Bollinger/Keltner/Donchian bands as 3 separate series
- WebSocket connection for live bar updates
- Indicator chips with remove button
- Volume histogram at the bottom (auto-scaled to 20% of pane)

## E2E test results

- 32 indicators listed (31 + VWAP — VWAP was added in the registry but not separately counted in the 31)
- All 7 tested indicators (SMA, EMA, RSI, MACD, BB, ATR, OBV) compute correctly
  - SMA, EMA, BB: 181 points
  - RSI, ATR: 186 points
  - MACD: 167 points (with signal + histogram)
  - OBV: 200 points
- Watchlist created with 1 item, retrievable
- Live bar delivered in 1.4s from WebSocket subscribe
- RLS isolation continues to enforce tenant boundaries

## Key design decisions

1. **Polling over WebSocket for live bars.** CCXT 4.5's Binance `watchOHLCV` throws `NotSupported`. We poll `fetchOHLCV` every 1s instead. This is reliable but slightly higher-latency (~1-2s). When CCXT fixes support, switch to WS.

2. **Indicators computed server-side, not client-side.** Each indicator computation hits `/api/indicators/compute` which fetches the bars and returns the indicator output. The client renders the lines. This keeps the client thin and lets us cache results later.

3. **Overlay indicators only in v1.** The chart UI shows only overlay indicators (SMA, EMA, BB, etc.). Non-overlay indicators (RSI, MACD, etc.) would need a separate pane. This is slice 9 work (advanced TA).

4. **WebSocket protocol is JSON + Zod-validated.** The discriminated union schema in `ws-protocol.ts` is the source of truth. Future versions can add new message types without breaking old clients.

5. **Bars are recomputed on each indicator change.** When the user adds/removes an indicator, we re-fetch and recompute. We don't have client-side indicator computation yet — server is the source of truth.

## Files added/modified

- `packages/ta-lib/package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts`, `src/overlap.ts`, `src/momentum.ts`, `src/volatility.ts`, `src/volume.ts`, `src/trend.ts`, `src/registry.ts`, `src/registry.test.ts`, `src/slice2.test.ts` (NEW)
- `packages/data-adapters/src/ccxt/binance.ts` (subscribe method rewritten with polling fallback)
- `apps/server/src/index.ts` (added WS upgrade via Bun.serve with websocket option)
- `apps/server/src/services/ws.ts` (NEW — WebSocket handlers and broadcast)
- `apps/server/src/routes/indicators.ts` (NEW — indicator list and compute)
- `apps/server/src/routes/watchlists.ts` (NEW — watchlist CRUD)
- `apps/server/package.json` (added @tv/ta-lib dep)
- `apps/web/package.json` (added @tv/ta-lib dep)
- `apps/web/src/api/types.ts` (added IndicatorDef, IndicatorOutput, Watchlist, WatchlistItem)
- `apps/web/src/api/client.ts` (added indicators and watchlists methods)
- `apps/web/src/App.tsx` (added /watchlists route)
- `apps/web/src/pages/ChartPage.tsx` (rewrote with indicators, multi-pane, WS)
- `apps/web/src/pages/WatchlistsPage.tsx` (NEW)

## What slice 3 picks up

- Pine Script v5 subset parser (PEG grammar) and interpreter
- Multi-chart layout (1/2/4/8/16 charts per tab)
- Custom intervals (seconds, range bars, tick bars)
- Meilisearch integration for symbol search
- Layouts persistence (save/load workspace configurations)

See `docs/ROADMAP.md` for the full roadmap.
