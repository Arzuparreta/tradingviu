# Slice 3 — Pine Script + Multi-chart + Search

Slice 3 is being delivered in three sequenced pieces, each on its own branch:

1. **3a — Meilisearch symbol search** ✅
2. **3b — Multi-chart layout + persistence** ✅ (this commit)
3. **3c — Pine Script engine (parser + interpreter + Monaco editor)** ⏳

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

