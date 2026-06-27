# Chart And Drawing Rework

This is the source of truth for the professional chart drawing rebuild.

New agents should also read `docs/CHART_DRAWINGS_AGENT_BRIEF.md` before making code changes.

## Current Reality

- `ChartPage` still uses `lightweight-charts` plus `LwcDrawingOverlay`, an SVG/React layer over the chart. This is the source of the modal "Draw/Done" workflow and the pan/zoom mismatch.
- `/layout` uses `KLineChartSurface` and `klinecharts@9.8.12`, so the app currently has two chart engines and two drawing interaction models.
- `packages/drawing-tools` originally owned API schemas. Public API schemas now start in `packages/core/src/drawing-schemas.ts`; drawing tools should become domain geometry, registries, migrations, and tool implementations.
- The persisted drawing shape is still a compatibility format. It is not the final professional drawing document model.

## Spike: `lightweight-charts-drawing@0.1.1` (2026-06-27)

**Verdict: PASS with wrapping required.** The library passes all critical architectural
requirements and will be wrapped behind our own `DrawingManager` interface in
`packages/drawing-tools`.

### What the library provides

- **68 drawing tool classes** (TrendLine, Rectangle, FibRetracement, etc.) — each
extends `Drawing` which implements `ISeriesPrimitive`, rendering natively inside
lightweight-charts' coordinate lifecycle (no SVG/CSS overlay).
- **DrawingManager** — manages drawing storage, selection (`selectDrawing` /
`deselectAll` / `getSelectedDrawing`), anchor dragging via `updateAnchor()`,
import (`importDrawings(data, factory)`) / export (`exportDrawings()`), and
an event system (`on('drawing:added', ...)`).
- **InteractionHandler** + subclasses (`TwoPointInteractionHandler`,
`SinglePointInteractionHandler`, `ThreePointInteractionHandler`) — tool
placement state machine (idle → placing → complete) that we wire to our own
mouse events. Includes `PreviewRenderer` for preview during placement.
- **ToolRegistry** — catalog of all 68 tools by category with factory
functions (`createDrawing(type, id, anchors, style, options)`).
- Depends on `fancy-canvas@^2.1.0` — same canvas abstraction as
`lightweight-charts@5.2.0`. No network calls.

### Assessment against requirements

| Requirement | Status | Notes |
|------------|--------|-------|
| Works with lw-charts 5.2.x | ✅ PASS | Same fancy-canvas dep |
| No real network calls | ✅ PASS | Pure client-side |
| Import/export control | ✅ PASS | `exportDrawings()` → `SerializedDrawing[]`, `importDrawings(data, factory)` |
| Selection + drag handles | ✅ PASS | `hitTestAnchor()`, `getControlPoints()`, `updateAnchor()`, visual handles |
| Lock/hide | ✅ PASS | `DrawingOptions.locked` and `.visible` |
| Custom toolbar state | ✅ PASS | `setActiveTool()` / `getActiveTool()` + `tool:changed` event |
| Renders during pan/zoom | ✅ PASS | ISeriesPrimitive-based — follows chart natively |
| Deterministic tests | ⚠️ PARTIAL | Geometry is testable; canvas rendering is visual |
| Tool placement workflow | ⚠️ PARTIAL | InteractionHandler handles placement state machine; must be wired manually |

### Integration risks and mitigations

1. **DOM event conflict:** DrawingManager adds `addEventListener` to the chart
   container for mousedown/mousemove/mouseup. Our React app currently uses React
   synthetic events on an overlay div. Mitigation: we control when the
   DrawingManager's handlers are active by toggling tool placement mode; in
   cursor mode, the chart's native pan/zoom/touch handling is untouched.
2. **Third-party shape leak:** The library's `SerializedDrawing` format must not
   leak into our API schemas or persisted rows. Mitigation: our wrapper maps
   between our `Drawing` format (from `packages/core/src/drawing-schemas.ts`)
   and the library's format.
3. **Early version (v0.1.1):** May have bugs or missing features. Mitigation:
   the wrapper isolates our code from the library; if we ever need to swap
   implementations, only the wrapper changes. We also contribute fixes upstream.
4. **React integration:** The library expects imperative DOM control. Mitigation:
   the wrapper exposes a React-compatible interface (hooks + imperative handle).

### Decision

We wrap the library behind our own `DrawingManager` interface defined in the
agent brief. The wrapper lives in `packages/drawing-tools/src/`. Public API
schemas remain in `packages/core/src/drawing-schemas.ts`. The library's class
shapes never appear in our API contracts.

## Canonical Direction

- Canonical web chart engine: `lightweight-charts@5.2.x`.
- Drawing rendering must live inside the chart's coordinate lifecycle using native primitives or a proven primitive-based drawing manager.
- `klinecharts` is transitional and should not receive new product investment unless a spike proves it is the final engine.
- The single chart and multi-chart layout must share one `ChartSurface` implementation.
- Cursor mode must never block chart navigation. Drawing tools may capture the chart only while placing or editing a drawing.

## TradingView-Parity Drawing Suite

Use TradingView's drawing taxonomy as the product target:

- Lines: trend line, ray, info line, extended line, trend angle, horizontal line/ray, vertical line, cross line.
- Channels: parallel channel, regression trend, flat top/bottom, disjoint channel.
- Pitchforks: Andrews, Schiff, modified Schiff, inside pitchfork.
- Fibonacci: retracement, extension, channel, time zone, speed fan, time extension, circles, spiral, arcs, wedge, pitchfan.
- Gann: box, fan, fixed square, square.
- Forecasting and measurement: long/short position, forecast, bars pattern, projection, price range, date range, date and price range.
- Shapes: rectangle, rotated rectangle, circle, triangle, ellipse, arc, path, polyline, curve, double curve.
- Annotations: text, callout, anchored text, note, price note, price label, flag, pin, comment, signpost, table.
- Brush/markers: brush, highlighter, arrow, arrow marker, arrow up, arrow down.

## Required UX

- No mandatory "Done" button to recover chart navigation.
- Esc cancels the active placement; Esc again exits drawing mode if already on cursor.
- Default tool behavior is single-use, then return to cursor. A separate stay-in-drawing-mode toggle can keep a tool active.
- Space-hold or middle/right drag pans even while drawing tools are available.
- Wheel/trackpad zoom and axis dragging remain native chart interactions.
- Selected drawings expose handles, lock, hide, duplicate, copy/paste, delete, z-order, and style editing.
- Object tree is required before the suite is considered professional: list drawings, rename, lock/hide, reorder, select, delete, group.
- Favorites/templates are required after the first full set of tools exists.

## Implementation Phases

### Progress (2026-06-27)

✅ Phase 1 spike complete. `lightweight-charts-drawing@0.1.1` passes.
✅ `DrawingManager` wrapper in `packages/drawing-tools/src/` (types, convert, drawing-manager).
✅ Shared `ChartSurface` component at `apps/web/src/components/chart-surface/`.
✅ `ChartSurface` integrated into `ChartPage` — refs populated via `onReady` callback.
✅ `LwcDrawingManager` wired into `ChartPage` via `useDrawingManager` hook + `DrawingToolbar`.
✅ `LwcDrawingOverlay` replaced by native primitive-based drawing rendering.
✅ All typechecks pass, all 21 web tests + 60 server tests pass.
⏳ Migrate `/layout` from `KLineChartSurface` to shared `ChartSurface`.
⏳ Add `update()` support for in-progress bar updates (currently uses `setData`).

### 1. Stabilize foundation:
   - [x] Remove false roadmap claims.
   - [x] Stop the SVG overlay from blocking cursor-mode pan/zoom. (native primitives render inside chart)
   - [x] Keep schemas at API boundaries in `packages/core`.
   - [x] Run a spike on `lightweight-charts-drawing@0.1.1` and document pass/fail.
   - [x] Use `docs/CHART_DRAWINGS_AGENT_BRIEF.md` as the execution handoff.

2. Unify surfaces:
   - [x] Extract a shared `ChartSurface` around `lightweight-charts`. (component at `apps/web/src/components/chart-surface/`)
   - [x] Integrate `ChartSurface` into `ChartPage` (keep behavior stable).
   - [ ] Move `/layout` off `KLineChartSurface` or prove a better single-engine path before continuing.
   - [ ] Preserve panel independence and raw crosshair sync.

3. Replace drawing internals:
   - [x] Introduce `DrawingManager` with native primitive rendering, hit testing, handles, history, import/export, and event callbacks. (`packages/drawing-tools/src/drawing-manager.ts`)
   - [x] Wire `LwcDrawingManager` into `ChartPage` replacing `LwcDrawingOverlay`.
   - [x] Migrate existing `klinecharts` drawing payloads into versioned drawing documents. (via `convert.ts`)
   - [x] Remove `LwcDrawingOverlay` from ChartPage. (component kept for tests)

4. Expand suite:
   - [ ] Ship tools by category, with geometry tests and Playwright acceptance for each category.
   - [ ] Do not add a toolbar button until the tool supports create, select, drag body, drag anchors, delete, persist, reload, and pan/zoom correctness.

## Acceptance Criteria

- A drawing moves continuously with the chart during pan and zoom, not only after release.
- Empty-chart drag in cursor mode pans the chart.
- Active tool placement captures only the interactions needed to create/edit the drawing.
- Single chart and `/layout` use the same drawing model.
- Reload preserves drawings and selected styles.
- `pnpm lint && pnpm typecheck && pnpm test` passes.
- Playwright covers pan/zoom correctness, keyboard shortcuts, persistence, and multi-panel independence.
