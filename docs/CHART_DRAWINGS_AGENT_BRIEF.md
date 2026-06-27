# Chart Drawings Agent Brief

Use this brief when starting a new chat or assigning a new agent to the chart drawing rework.

## Read Order

1. `AGENTS.md`
2. `docs/ROADMAP.md`
3. `docs/CHART_DRAWINGS_REWORK.md`
4. This file

## Session Progress (last: 2026-06-27, commit `b6021b5`)

✅ **Phase 1-3 foundation delivered.** `lightweight-charts-drawing@0.1.1` passes the
spike. We have a working native-primitive drawing system in `ChartPage` and `/layout`:

- `packages/drawing-tools/src/` — `LwcDrawingManager` wrapper, format conversion,
  public types
- `apps/web/src/components/chart-surface/` — shared `ChartSurface` component
- `apps/web/src/hooks/use-drawing-manager.ts` — hook with load/save + undo/redo
- `apps/web/src/components/DrawingToolbar.tsx` — toolbar with ~13 tools,
  keyboard shortcuts, lock/delete/clear
- `apps/web/src/pages/ChartPage.tsx` — integrated with native primitive drawings
- `apps/web/src/components/ChartPanel.tsx` — `/layout` panels use `ChartSurface`
  with one drawing manager per `drawingScopeId`

**Focused checks pass: drawing-tools typecheck + 4 tests, web typecheck + 15 tests, server typecheck + 60 tests.**

## Where to Continue

1. **Expand tool coverage** — `convert.ts` maps a larger compatibility set, but
   the toolbar should only expose tools that support create, select, drag,
   delete, persist, reload, and pan/zoom correctness.

2. **Playwright acceptance tests** — pan/zoom correctness, keyboard shortcuts,
   persistence, multi-panel independence.

3. **Object tree and style controls** — list drawings, rename, lock/hide,
   reorder, select, delete, group, and edit styles.

## Verification commands (copy-paste ready)

```bash
# Quick checks
pnpm --filter @tv/drawing-tools typecheck && pnpm --filter @tv/web typecheck && pnpm --filter @tv/server typecheck
pnpm --filter @tv/web test && pnpm --filter @tv/server test

# Full gate
pnpm lint && pnpm typecheck && pnpm test

# Manual smoke
pnpm dev:restart
curl -fsS http://localhost:3101/health
# Open http://localhost:5187, test /chart/:symbol and /layout
```

## Product Goal

Build a professional TradingView-grade drawing system. Do not polish the current overlay as if it were the final architecture.

The target is a single chart surface shared by `/chart/:symbol` and `/layout`, using `lightweight-charts@5.2.x` plus native primitives or a proven primitive-based drawing manager. Cursor mode must behave like a trading chart: dragging empty chart space pans the chart, wheel/trackpad zoom still works, and drawing tools only capture input while placing/editing an object.

## Non-Negotiable Decisions

- Canonical web chart engine: `lightweight-charts@5.2.x`.
- `klinecharts` is no longer a runtime dependency. Keep compatibility only at the persisted drawing schema/conversion layer.
- Drawing schemas at API boundaries belong in `packages/core/src/drawing-schemas.ts`.
- `packages/drawing-tools` owns drawing domain helpers: registry, geometry, hit testing, migrations, and final tool implementations.
- `/layout` panels remain independent. Crosshair sync can stay raw; timeframe sync must not come back.
- Do not add a drawing toolbar button unless the tool supports create, select, drag body, drag anchors, delete, persist, reload, and pan/zoom correctness.
- No mandatory "Done" workflow. Esc cancels active placement; Esc again exits drawing mode if already on cursor.

## Current Implementation Map

- Single chart: `apps/web/src/pages/ChartPage.tsx`
- Shared chart surface: `apps/web/src/components/chart-surface/ChartSurface.tsx`
- Multi-chart panel: `apps/web/src/components/ChartPanel.tsx`
- Drawing load/save manager hook: `apps/web/src/hooks/use-drawing-manager.ts`
- Drawing API route: `apps/server/src/routes/drawings.ts`
- Drawing row mapper: `apps/server/src/services/drawings.ts`
- Shared drawing schemas: `packages/core/src/drawing-schemas.ts`
- Drawing helper package: `packages/drawing-tools/src/index.ts`
- Layout state contract: `packages/layout-sync/src/index.ts`

## First Development Task

Start with the drawing-manager spike and shared surface extraction. Do not start by adding more tool buttons.

1. Audit `lightweight-charts-drawing@0.1.1` in a throwaway integration branch or isolated component.
   - It must work with `lightweight-charts@5.2.x`.
   - It must not require real network calls.
   - It must expose enough control for import/export, selection, drag handles, lock/hide, custom toolbar state, and deterministic tests.
   - It must render during pan/zoom through lightweight primitives, not by repositioning a React/SVG overlay after gestures.

2. Record the verdict in `docs/CHART_DRAWINGS_REWORK.md`.
   - If it passes, wrap it behind our own `DrawingManager` interface.
   - If it fails, build the same interface internally using lightweight-charts primitives.
   - Do not leak a third-party class shape into API schemas or persisted rows.

3. Extract a shared `ChartSurface` for `lightweight-charts`.
   - Target location: `apps/web/src/components/chart-surface/`.
   - Keep `ChartPage` behavior stable while extracting.
   - Only move `/layout` after the single-chart surface is proven with tests.

## Target Interfaces

Keep the implementation decision-complete around this shape:

```ts
export interface ChartSurfaceHandle {
  readonly chart: unknown;
  readonly mainSeries: unknown;
  fitContent(): void;
  setData(bars: readonly Bar[]): void;
}

export interface DrawingManager {
  importDrawings(drawings: readonly Drawing[]): void;
  exportDrawings(): Drawing[];
  startTool(toolId: string): void;
  cancelPlacement(): void;
  select(id: string | null): void;
  remove(id: string): void;
  clear(): void;
  setLocked(id: string, locked: boolean): void;
  setVisible(id: string, visible: boolean): void;
  onChange(callback: (drawings: Drawing[]) => void): () => void;
}
```

Use real lightweight-charts types in implementation files. The `unknown` fields above only keep this brief decoupled from import details.

## Testing Contract

Focused checks while developing:

```bash
pnpm --filter @tv/core typecheck
pnpm --filter @tv/drawing-tools typecheck
pnpm --filter @tv/web typecheck
pnpm --filter @tv/web test
pnpm --filter @tv/server typecheck
pnpm --filter @tv/server test
```

Full completion gate:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Manual smoke:

```bash
pnpm dev:restart
curl -fsS http://localhost:3101/health
```

Then open `http://localhost:5187`, test `/chart/:symbol` and `/layout`.

## Acceptance Scenarios

Before marking any drawing rework slice done:

- Empty chart drag in cursor mode pans the chart.
- Wheel/trackpad zoom and axis drag work while drawing tools are available.
- Active tool placement captures the chart only for placement/editing.
- Existing saved drawings reload.
- A drawing follows the chart continuously during pan and zoom.
- Selected drawings can be deleted and undo/redo remains chart-local.
- `/layout` panels keep separate symbols, intervals, drawings, and histories.
- Raw crosshair sync in `/layout` remains raw and does not become magnetic.

## Do Not Do

- Do not implement a CSS-only imitation of native chart behavior.
- Do not add more line-like aliases just to increase the tool count.
- Do not persist third-party objects directly.
- Do not reintroduce `Panel.drawings`; use stable drawing scopes.
- Do not revive interval/timeframe sync in `/layout`.
- Do not bypass Zod validation at API edges.
