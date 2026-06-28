# Chart And Drawing Rework

This project changed direction on 2026-06-28. The earlier
lightweight-charts-native drawing rebuild worked, but the owner decided not to
keep building a hand-managed drawing UX. The primary chart direction is now
KLineChart Pro because it ships a built-in drawing suite, indicators, symbol
search, period bar, screenshots, and fullscreen controls.

## Current Reality

- `/chart` and `/chart/:symbol` render `ChartProPage`, backed by
  `KLineProChart`.
- `/chart-pro` remains as an explicit route to the same Pro surface.
- `/chart-legacy` keeps the old lightweight-charts drawing page available for
  Playwright coverage until the legacy stack is removed.
- `klinepro-datafeed.ts` adapts the existing API:
  - symbols: `/api/symbols` and `/api/symbols/search`
  - history: `/api/chart/history`
  - live bars: `/ws`
- `/layout` still uses the legacy lightweight-charts `ChartSurface` and
  `@tv/drawing-tools`.
- Pine preview still uses `@tv/chart-engine`.
- Drawing API routes and old drawing schemas remain until the layout/Pine
  migration decides the final KLineChart Pro persistence contract.

## Do Not Regress

- Do not add more manual drawing toolbar controls to the legacy surface.
- Do not revive the old social/SaaS constraints to justify chart work.
- Do not remove `@tv/chart-engine` or `@tv/drawing-tools` until no compiled
  app/test imports them.
- `/layout` panels must remain independent. Timeframe sync should not come back.
- Automated tests should not hit real provider networks.

## Next Chart Work

1. Verify KLineChart Pro drawing create/edit/reload behavior and decide whether
   to persist Pro overlays in the existing `drawings` table or use Pro's local
   layout manager as an interim bridge.
2. Replace `/layout` panel rendering with KLineChart Pro/klinecharts while
   preserving independent symbols/intervals and chart-local state.
3. Migrate Pine preview to klinecharts.
4. Remove the lightweight stack only after typecheck, tests, and browser smoke
   prove there are no imports or behavior gaps.

## Smoke Commands

```bash
pnpm dev:restart
curl -fsS http://localhost:3101/health
open http://localhost:5187/chart/BTCUSDT
```
