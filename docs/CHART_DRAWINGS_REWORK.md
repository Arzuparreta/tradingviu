# Chart And Drawing Rework

This is the source of truth for the professional chart drawing rebuild.

New agents should also read `docs/CHART_DRAWINGS_AGENT_BRIEF.md` before making code changes.

## Current Reality

- `ChartPage` uses the shared `ChartSurface` plus the `LwcDrawingManager` wrapper, so drawings render as native lightweight-charts primitives.
- `/layout` also uses the shared `ChartSurface` through `ChartPanel`, with one `useDrawingManager` instance per panel scoped by `drawingScopeId`.
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

| Requirement                | Status     | Notes                                                                       |
| -------------------------- | ---------- | --------------------------------------------------------------------------- |
| Works with lw-charts 5.2.x | ✅ PASS    | Same fancy-canvas dep                                                       |
| No real network calls      | ✅ PASS    | Pure client-side                                                            |
| Import/export control      | ✅ PASS    | `exportDrawings()` → `SerializedDrawing[]`, `importDrawings(data, factory)` |
| Selection + drag handles   | ✅ PASS    | `hitTestAnchor()`, `getControlPoints()`, `updateAnchor()`, visual handles   |
| Lock/hide                  | ✅ PASS    | `DrawingOptions.locked` and `.visible`                                      |
| Custom toolbar state       | ✅ PASS    | `setActiveTool()` / `getActiveTool()` + `tool:changed` event                |
| Renders during pan/zoom    | ✅ PASS    | ISeriesPrimitive-based — follows chart natively                             |
| Deterministic tests        | ⚠️ PARTIAL | Geometry is testable; canvas rendering is visual                            |
| Tool placement workflow    | ⚠️ PARTIAL | InteractionHandler handles placement state machine; must be wired manually  |

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
- `klinecharts` is no longer a runtime dependency. Keep compatibility only at the persisted drawing schema/conversion layer.
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
✅ `LwcDrawingOverlay` replaced by native primitive-based drawing rendering and removed.
✅ `/layout` migrated from `KLineChartSurface` to shared `ChartSurface`.
✅ `klinecharts` dependency and transitional `KLineChartSurface` removed from the web app.
✅ Focused checks pass: drawing-tools typecheck + 6 tests, web typecheck + 15 tests, server typecheck + 60 tests.
✅ Expanded typed drawing tool catalog and toolbar across lines, channels, Fibonacci, pitchforks/Gann, measurement, shapes, annotations, and markers.
✅ Added drawing-tools tests that prove every toolbar tool maps to a registered `lightweight-charts-drawing` tool and round-trips through the persisted drawing shape.
✅ Replaced the full-width tool wall with a compact left drawing dock, grouped flyouts, favorite/recent tools, object tree, magnet/stay toggles, and inspector controls: list/select/rename, lock/hide, group labels, duplicate, copy/paste, z-order, delete/clear, and line/fill/text style editing.
✅ Added local favorite drawing tools and reusable style templates.
✅ Added deterministic web acceptance coverage for object management, keyboard shortcuts, persistence, undo/redo, z-order, and multi-panel drawing-scope independence.
✅ Added Playwright infrastructure plus browser E2E coverage for cursor-mode pan/zoom with drawings mounted and object-tree edit/reload/delete persistence.
✅ Broadened browser E2E coverage for representative drawing creation/reload/clear flows across lines, channels, Fibonacci, measurement, shapes, and annotations.
✅ Added browser E2E coverage for `/layout` drawing-scope isolation across two panels using the same symbol.
✅ Added browser E2E coverage for edge drawing tools: single-anchor annotations, brush/highlighter strokes, and marker tools.
✅ Added live placement preview canvas after the first anchor.
✅ Added direct canvas selection, keyboard copy/paste from canvas selection, whole-object body drag, and pan suppression while dragging drawings.
✅ Added four-corner persisted/editable parallel channels while retaining native primitive rendering.
✅ Added batch drawing upsert/delete endpoint and client path for incremental edits while keeping `GET/PUT /api/drawings` compatibility.
✅ Added versioned v2 drawing document schema in `@tv/core` for future sync/visibility migration.
✅ Added drawing alert conditions and deterministic server evaluation for line/channel/rectangle-style price geometry.

### Progress (2026-06-28)

✅ Text annotation workflow end-to-end: text content for `text`/`callout`/`anchoredText`/`note`/`comment`/`signpost` (via the library `text` option) and `flag`/`pin` (via `label`) now round-trips through `extendData.text` ↔ library options in `convert.ts`, with an inline inspector text field (`setDrawingText`) and create/edit/reload browser coverage.
✅ Multi-point placement for `path`/`polyline` (click to add vertices, finish on Enter or double-click) and `brush`/`highlighter`, with trailing-anchor de-duplication and capture-phase double-click so the chart never resets while finishing. Covered by browser E2E.
✅ Deeper per-tool edit coverage: browser E2E for dragging an anchor on a 3-anchor Andrews pitchfork (only the dragged anchor moves) and dragging the body of a 3-anchor Fibonacci extension (all anchors shift), both reloading cleanly.
✅ Interval-scoped visibility is enforced on render: `DrawingManager.setIntervalContext()` plus `drawingAllowedOnInterval()` hide drawings whose `extendData.visibility` (`{ mode: only|except, intervals }`) excludes the active interval, while the persisted `visible`/`lock` stay authoritative (drags never overwrite them).
✅ Inspector now edits drawing sync mode (`scope`/`symbol`/`global`), interval visibility (mode + interval list), and per-drawing alert config (operator + line/upper/lower target), all persisted to `extendData` and covered by component, hook, and browser tests.
✅ Added a deterministic canvas-pixel visual check: the selected drawing's colored line keeps painting on the chart surface through pan and wheel-zoom (proving native-primitive rendering, not a stale overlay).
✅ Hardened test isolation: the `@tv/drawing-tools` module mock now re-exports the real module so process-wide bun mocks no longer leak partial exports into sibling test files.
✅ Full gate green: `pnpm typecheck`, `pnpm test` (drawing-tools 11, web 25, server 63), and `pnpm e2e` (17 Playwright specs) all pass.

### 1. Stabilize foundation:

- [x] Remove false roadmap claims.
- [x] Stop the SVG overlay from blocking cursor-mode pan/zoom. (native primitives render inside chart)
- [x] Keep schemas at API boundaries in `packages/core`.
- [x] Run a spike on `lightweight-charts-drawing@0.1.1` and document pass/fail.
- [x] Use `docs/CHART_DRAWINGS_AGENT_BRIEF.md` as the execution handoff.

2. Unify surfaces:
   - [x] Extract a shared `ChartSurface` around `lightweight-charts`. (component at `apps/web/src/components/chart-surface/`)
   - [x] Integrate `ChartSurface` into `ChartPage` (keep behavior stable).
   - [x] Move `/layout` off `KLineChartSurface`.
   - [x] Preserve panel independence and raw crosshair sync.

3. Replace drawing internals:
   - [x] Introduce `DrawingManager` with native primitive rendering, hit testing, handles, history, import/export, and event callbacks. (`packages/drawing-tools/src/drawing-manager.ts`)
   - [x] Wire `LwcDrawingManager` into `ChartPage` replacing `LwcDrawingOverlay`.
   - [x] Migrate existing `klinecharts` drawing payloads into versioned drawing documents. (via `convert.ts`)
   - [x] Remove `LwcDrawingOverlay`.

4. Expand suite:
   - [x] Ship broad tool categories through the typed catalog and dock flyouts.
   - [x] Guard toolbar tools with registry + round-trip tests.
   - [x] Add deterministic acceptance coverage for category-level management, keyboard shortcuts, persistence, undo/redo, z-order, and multi-panel independence.
   - [x] Add browser-level E2E coverage for native pan/zoom and object-tree persistence.
   - [x] Do not add a toolbar button until the tool supports create, select, drag body, drag anchors, delete, persist, reload, and pan/zoom correctness for the representative browser-covered tools.

## Where to Continue (next session)

The 2026-06-28 pass closed the previously-listed gaps (visual regression check,
3-anchor edit coverage, brush/path/polyline completion, annotation text, and the
sync/interval/alert UI). Remaining work to reach deeper TradingView parity:

1. **Cross-scope sync execution** — the inspector persists `syncMode`
   (`scope`/`symbol`/`global`), but drawings are still loaded/saved per scope.
   Wire `symbol`/`global` drawings so they appear across matching charts and
   `/layout` panels, with conflict-free batch persistence.

2. **Freehand brush** — `brush`/`highlighter` currently place vertices by click
   (finish on Enter/double-click) like `path`/`polyline`. Add a true drag-to-draw
   gesture (mousedown→sample on move→mouseup) with chart-pan suppression while
   the stroke is active.

3. **Per-tool deep editing** — expose tool-specific options the library supports
   but we don't surface yet (fib levels/visibility, pitchfork variants, Gann
   ratios, long/short position risk-reward fields) in the inspector.

4. **Richer text styling** — font size/family/weight/alignment and callout/note
   box styling beyond the single text-color control.

5. **Screenshot-based visual regression** — the canvas-pixel check proves the
   drawing renders; committing golden screenshots (once visuals stabilize) would
   catch finer rendering regressions.

## Acceptance Criteria

- A drawing moves continuously with the chart during pan and zoom, not only after release.
- Empty-chart drag in cursor mode pans the chart.
- Active tool placement captures only the interactions needed to create/edit the drawing.
- Single chart and `/layout` use the same drawing model.
- Reload preserves drawings and selected styles.
- `pnpm lint && pnpm typecheck && pnpm test` passes.
- Playwright covers pan/zoom correctness, persistence, and eventually multi-panel independence.
