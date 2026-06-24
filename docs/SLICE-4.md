# Slice 4 — Alerts + Portfolios + Paper trading

Commit: `4fd3fd3`

## What it delivered

Three tenant-scoped trading features, each backed by a pure engine (no I/O, fully unit-tested) plus a thin Hono route and a React page. **No DB migration was required** — the foundation schema already contained the tenant-scoped tables.

### Alert engine (`apps/server/src/services/alert-engine.ts`)

A pure condition evaluator covering three condition shapes:

- **price** — `above` / `below` / `crosses_above` / `crosses_below` / `equals`
- **indicator** — evaluates a `@tv/ta-lib` indicator line against an operator/value
- **multi** — `all` / `any` composition of nested conditions (recursive, max depth via `AlertConditionSchema`)

Schemas live in `packages/core/src/trading-schemas.ts` (`AlertConditionSchema` is a `z.lazy` discriminated union so `multi` can nest).

Routes (`apps/server/src/routes/alerts.ts`):

- `GET /api/alerts` — list
- `POST /api/alerts` — create
- `PATCH /api/alerts/:id` — update (e.g. toggle `active`)
- `DELETE /api/alerts/:id`
- `POST /api/alerts/:id/evaluate` — evaluate against a supplied price/previousPrice (manual trigger)
- `GET /api/alerts/:id/history` — fired history

Channels: `in_app` is delivered now; `email` / `webhook` are recorded for future background workers (see `services/notifier`).

### Portfolio engine (`apps/server/src/services/portfolio-engine.ts`)

Pure holdings + P&L rebuild from a transaction log:

- Average-cost holdings, realized P&L on sells, dividends and fees tracked
- `computeHoldings(transactions)` returns `{ holdings, metrics }`
- `toDecimalText` helper keeps numeric values as Postgres `numeric` text to avoid float drift

Routes (`apps/server/src/routes/portfolios.ts`): portfolios CRUD, `POST /:id/transactions`, and a detail endpoint returning holdings + transactions + metrics.

### Paper trading (`apps/server/src/services/paper-trading.ts`)

Pure fill model: market and limit orders with instant/pending fills, slippage (bps), fees (bps), and a buying-power check (balance × leverage).

Routes (`apps/server/src/routes/paper.ts`): paper accounts CRUD, account detail with orders, and `POST /:id/orders` which fills via the engine and updates the cash balance on filled orders.

## Web

- `apps/web/src/pages/AlertsPage.tsx`
- `apps/web/src/pages/PortfoliosPage.tsx`
- `apps/web/src/pages/PaperTradingPage.tsx`

All wired into `App.tsx` nav and `apps/web/src/api/client.ts` / `types.ts`.

## Tests

`apps/server/src/services/slice4.test.ts` — price-cross evaluation, holdings/realized-P&L rebuild, market fill with fee + slippage.
