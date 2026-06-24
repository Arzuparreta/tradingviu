# Slice 3 — Pine Script + Multi-chart + Search

Slice 3 is being delivered in three sequenced pieces, each on its own branch:

1. **3a — Meilisearch symbol search** ✅
2. **3b — Multi-chart layout + persistence** ✅
3. **3c — Pine Script engine (parser + interpreter + Monaco editor)** ✅ (this commit)

---

## 3a — Meilisearch symbol search

### What it delivers

A typo-tolerant, ranked symbol search with a graceful DB fallback, wired end-to-end
from a Meili index through an API endpoint to a global ⌘K search box in the web UI.

### Backend (`apps/server`)

- **`services/search.ts`** — Meili client (lazy, from `MEILI_HOST` / `MEILI_MASTER_KEY`):
  - `ensureSymbolsIndex()` — creates the `symbols` index (primary key `id`) and applies
    searchable attributes (`ticker`, `name`, `baseCurrency`, `quoteCurrency`, `exchange`),
    filterable attributes (`assetClass`, `exchange`, `active`), ranking rules, and typo tolerance.
  - `indexAllSymbols(db)` — reads every symbol (joined with its exchange) and pushes docs to Meili.
    Symbols are global reference data (`symbols_read` RLS policy is `USING (true)`), so the indexer
    needs no tenant context.
  - `searchSymbols(q, opts)` — typo-tolerant search; returns `null` when search is disabled.
  - `buildSymbolFilter(opts)` — pure filter builder (unit-tested).
  - `searchEnabled()` — true only when `MEILI_HOST` is configured.
- **`routes/search.ts`** — `GET /api/search?q=&assetClass=&limit=`:
  - Prefers Meili. On disabled/unreachable Meili, falls back to a DB `ILIKE` query that ranks
    ticker matches ahead of name-only matches. Response includes `backend: 'meili' | 'db'`.
- **`routes/admin.ts`** — `POST /admin/search/reindex` (super-admin) to rebuild the index on demand.
- **`index.ts`** — indexes symbols into Meili on boot (fire-and-forget; logs a notice and uses the
  DB fallback if Meili is down or `MEILI_HOST` is unset).
- **`packages/core/src/env.ts`** — added optional `MEILI_HOST` and `MEILI_MASTER_KEY`
  (already present in `.env.example`).

### Frontend (`apps/web`)

- **`components/SymbolSearch.tsx`** — global search box in the top bar:
  - Debounced (150 ms) query via TanStack Query.
  - ⌘K / Ctrl-K focus shortcut, arrow-key navigation, Enter to open the chart, Esc/click-outside to close.
  - Selecting a result navigates to `/chart/:id`.
- **`api/client.ts`** — `api.search(q, opts)`.
- **`styles/index.css`** — dropdown styling consistent with the existing dark theme.

### Design decisions

1. **Graceful degradation.** Search never hard-depends on Meili. If `MEILI_HOST` is unset or the
   service is down, the endpoint transparently falls back to a DB `ILIKE` query. This keeps
   self-hosters who skip Meili fully functional.
2. **Search lives in `apps/server/services`**, alongside `ws.ts` and `data.ts`, rather than a
   separate package — it has no consumers outside the server.
3. **Symbols are global**, so search results are not tenant-scoped and the indexer runs without a
   tenant context.

### Verification (live, against Postgres + Meili)

- Boot indexed 11 seeded symbols into Meili.
- Exact match (`BTC`), typo tolerance (`Bitcon` → Bitcoin), and `assetClass=crypto` filter all
  returned correct, ranked results with `backend: meili`.
- With Meili stopped, the same queries fell back to `backend: db`, and the ticker-first ordering put
  `ETHUSDT`/`ETHUSD` ahead of substring matches like "Avalanche / TetherUS".
- Restarting Meili restored the `meili` backend.
- `buildSymbolFilter` unit tests (4) pass; `pnpm typecheck` green across the workspace.

---

## 3b — Multi-chart layout + persistence

### What it delivers

A 1/2/4/8/16 multi-chart grid with per-panel symbol + timeframe, cross-panel sync
(symbol / interval / crosshair), and named layouts saved per user.

### `packages/layout-sync` (new)

The schema + helpers that both the API and web share (single source of truth):

- `INTERVALS` / `IntervalSchema` — supported timeframes.
- `GRID_PRESETS` — `1` (1×1), `2` (2×1), `4` (2×2), `8` (4×2), `16` (4×4) with `{ count, cols, rows, label }`.
- `PanelSchema` — `{ id, symbolId|null, interval, indicators[] }`.
- `SyncSchema` — `{ symbol, interval, crosshair }` toggles.
- `LayoutConfigSchema` — `{ grid, panels, sync, activePanel }` with `superRefine` checks:
  panel count must match the grid, `activePanel` in range, panel ids unique.
- Helpers: `makePanel`, `defaultLayoutConfig`, `reflowToGrid` (preserve panels when re-tiling),
  `parseLayoutConfig`. 7 unit tests.

### Backend (`apps/server`)

- **`routes/layouts.ts`** — `/api/layouts` CRUD, all tenant + user scoped:
  - `GET /layouts`, `GET /layouts/:id`, `POST /layouts`, `PUT /layouts/:id`, `DELETE /layouts/:id`.
  - Config validated through `LayoutConfigSchema` at the edge (bad config → 400).
  - `isDefault` is exclusive: setting one default clears the others in the same RLS transaction.
- Uses the existing `layouts` table (already migrated in slice 1; RLS policy `layouts_tenant_iso`).

### Frontend (`apps/web`)

- **`components/ChartPanel.tsx`** — self-contained chart: candles + volume, autosizing,
  history via TanStack Query, inline symbol picker, interval selector, optional live WS bars.
  Registers its chart + series with the parent for crosshair sync.
- **`components/SymbolSearch.tsx`** — refactored to be reusable: an optional `onSelect` callback
  (panels set a symbol) vs. the default navigate-to-chart behavior; ⌘K only binds the global box.
- **`pages/LayoutPage.tsx`** (`/layout`) — grid buttons (1/2/4/8/16 via `reflowToGrid`), sync
  toggles, layout `<select>` to load saved layouts, Save / Save as… / Set default / Delete.
  Symbol/interval sync propagate from the changed panel to all panels; crosshair sync mirrors the
  pointer across charts via `subscribeCrosshairMove` → `setCrosshairPosition`.
- Top-bar "Layouts" nav link + route.

### Design decisions

1. **Schema in `@tv/layout-sync`, imported by both server and web.** No drift between what the API
   validates and what the UI builds.
2. **Live bars only on the active panel.** Avoids opening up to 16 WebSocket connections at once.
3. **`isDefault` exclusivity in one transaction.** The tenant middleware already wraps each handler
   in an RLS transaction, so clearing old defaults and inserting the new one is atomic.
4. **`reflowToGrid` preserves panels.** Switching 4→1→4 keeps the symbols you already placed.

### Verification

- `layout-sync` unit tests (7) pass; `pnpm typecheck` green (23 tasks); `vite build` succeeds.
- Live API E2E against Postgres: create (2-panel BTC/ETH), list, get, rename (PUT), delete, default
  exclusivity (second default unset the first), and config validation (bad panel count → HTTP 400).
- Visual QA of the rendered grid was not run (the headless browse tool needs a one-time build).

---

## 3c — Pine Script engine

### What it delivers

A working Pine Script v5 **subset**: a PEG parser → typed AST → sandboxed interpreter
(no `eval`) that runs over real bars, plus `/api/pine/validate` + `/api/pine/run` and a
Monaco editor page that overlays a script's plots on a chart.

See `packages/pine-parser/GRAMMAR.md` for the exact supported subset.

### `packages/pine-parser` (new)

- `grammar.ts` — peggy PEG grammar, generated at module load via `peggy.generate` (no build
  step; works under Bun/tsx). Handles `//@version`, line comments, declarations, expression
  statements, member access, calls with positional + named args, arithmetic / comparison /
  logical operators, the `?:` ternary, numbers, strings, booleans, `na`.
- `ast.ts` — typed AST + `PineParseError` (with line/column).
- `index.ts` — `parse(source) → Program`, `extractVersion`. 8 unit tests.

### `packages/pine-runtime` (new)

- `series.ts` — bar-aligned series math over `(number|null)[]` (`null` = `na`): sma, ema, wma,
  rma, rsi, stdev, change, highest, lowest, atr. Leading `null`s while warming up, matching Pine.
- `interpreter.ts` — AST-walk evaluator. Values are scalars / colors / series / `na`; binary ops
  broadcast scalar↔series; the ternary selects per-bar when the condition is a series. Builtins:
  `indicator/strategy`, `input.*`, `ta.*`, `math.*`, `nz`, `na`, `plot`, `hline`, and accepted
  no-ops (`plotshape`, `plotchar`, `bgcolor`). Inputs are overridable by title.
- `index.ts` — `validate(source)` (parse + dry-run against one probe bar → metadata or a
  parse/runtime error), `compileAndRun(source, bars, inputs)`. 13 unit tests.

### Backend (`apps/server`)

- **`routes/pine.ts`** — `POST /api/pine/validate` and `POST /api/pine/run` (fetches bars via the
  CCXT provider like `/indicators/compute`, runs the script, returns `{ title, overlay, kind,
  inputs, plots, times }`). Parse/runtime errors return HTTP 400 with `{ kind, message, line?,
  column? }` rather than a 500.

### Frontend (`apps/web`)

- **`lib/monaco-pine.ts`** — bundles Monaco locally (trimmed `editor.api`, single editor worker —
  no CDN, no extra languages) and registers a `pine` language: Monarch highlighting + a completion
  provider for builtins/series/colors.
- **`pages/PineEditorPage.tsx`** (`/pine`) — split view: Monaco on the left, a price chart on the
  right. Pick a symbol (reused `SymbolSearch`) + interval, Run → overlay plots draw on the price
  chart; non-overlay scripts (e.g. RSI) draw in a separate pane below. Validates on edit (debounced)
  with an inline OK/error status. "Pine" nav link + route.

### Design decisions

1. **peggy at runtime, not a build step.** `peggy.generate(GRAMMAR)` runs once at import — keeps
   the package consistent with the repo's no-build TS execution while honoring the roadmap's
   "PEG grammar (peggy)" decision.
2. **Series-native runtime, not ta-lib reuse.** ta-lib functions are `bars → IndicatorOutput`
   (close-based); Pine needs `series → series` so `ta.sma(hl2, len)` composes. The runtime
   implements its own small series-math set, unit-tested against known values.
3. **No `eval`.** The interpreter walks the AST; only whitelisted builtins are callable. Unknown
   functions/variables raise `PineRuntimeError`.
4. **Monaco bundled, trimmed.** Imported via `monaco-editor/esm/vs/editor/editor.api` to drop the
   built-in language packs (~1 MB saved). Lazy-loading the editor route is a future optimization.

### Verification

- Unit tests: parser 8, runtime 13 (series math + end-to-end scripts + validation). `pnpm typecheck`
  green across the workspace; `vite build` succeeds (Monaco bundles, no CDN).
- Live API E2E against Postgres + a CCXT provider:
  - `validate` returns metadata for a valid script and a parse error with line/column for `x = (1 +`.
  - `run` of `ta.sma(close, 20)` on BTCUSDT (1h, 60 bars) produced a plot with exactly 41 non-null
    values (20-bar warmup) and realistic prices, with the color resolved from `color.blue`.
- Visual QA of the Monaco page was not run (headless browse tool needs a one-time build).

## What slice 4 picks up

Alerts engine (price / indicator / multi-condition + channels), portfolios CRUD, and the paper
trading engine. See `docs/ROADMAP.md`.

