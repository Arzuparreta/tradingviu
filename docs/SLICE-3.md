# Slice 3 — Pine Script + Multi-chart + Search

Slice 3 is being delivered in three sequenced pieces, each on its own branch:

1. **3a — Meilisearch symbol search** ✅ (this commit)
2. **3b — Multi-chart layout + persistence** ⏳
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
