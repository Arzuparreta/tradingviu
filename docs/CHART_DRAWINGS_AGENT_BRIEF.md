# Chart Drawings Agent Brief

Read order:

1. `AGENTS.md`
2. `docs/ROADMAP.md`
3. `docs/CHART_DRAWINGS_REWORK.md`
4. this file

## Current Brief

KLineChart Pro is the primary chart direction. The previous
lightweight-charts-drawing implementation is now transitional legacy code, not
the target UX.

Working now:

- `/chart` and `/chart/:symbol` use `ChartProPage`.
- KLineChart Pro renders in browser with candles, moving averages, volume, period
  controls, symbol search, and the native drawing toolbar.
- Dashboard links to `/chart/BTCUSDT`.
- Legacy drawing E2E runs against `/chart-legacy/BTCUSDT`.

Still legacy:

- `/layout` uses `ChartPanel`, `ChartSurface`, `useDrawingManager`, and
  `DrawingToolbar`.
- Pine preview uses `@tv/chart-engine`.
- Tests still cover legacy drawing behavior.

## Rules

- Do not add more manual drawing-tool buttons.
- Do not delete legacy chart packages until `/layout`, Pine preview, and tests
  have been migrated.
- Preserve `/layout` panel independence.
- Keep raw crosshair behavior if crosshair sync is reintroduced.
- Keep API payloads validated with Zod.

## Next Implementation Task

Migrate `/layout` one panel at a time to KLineChart Pro or klinecharts core:

1. Build a reusable panel wrapper from `KLineProChart` that accepts symbol and
   period props.
2. Keep panel symbol/interval controls independent.
3. Prove two same-symbol panels do not share mutable chart state.
4. Only then remove old drawing toolbar tests or rewrite them around the new Pro
   drawing contract.

## Verification

```bash
pnpm --filter @tv/web typecheck
pnpm --filter @tv/web test
pnpm e2e
```
