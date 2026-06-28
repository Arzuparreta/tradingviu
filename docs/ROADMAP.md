# Roadmap & Status

Read this before editing. `tradingviu` has pivoted from a multi-tenant SaaS clone
to a personal single-owner trading platform.

## Current Status

Done locally:

- SaaS monetization removed: no billing package, Stripe checkout, plans, quotas,
  or upgrade dashboard.
- Social/community removed: no ideas feed, comments, follows, spaces, or scripts
  marketplace. Personal Pine scripts remain.
- Multi-tenancy removed from the runtime model: request context is `{ userId }`,
  user-owned data scopes by `user_id`, and RLS/tenant membership/super-admin
  flows are no longer canonical.
- Development DB schema was regenerated as a clean single-user schema.
- KLineChart Pro was added and verified in browser.
- `/chart` and `/chart/:symbol` now route to the KLineChart Pro surface.
- Dashboard has been rebuilt as a trading desk using existing watchlist,
  portfolio, alert, calendar, news, and chart-history APIs.

Still transitional:

- `/layout` uses `apps/web/src/components/ChartPanel.tsx`, the shared
  lightweight-charts `ChartSurface`, and `@tv/drawing-tools`.
- `/chart-legacy` exists only as a transition/test route for the old
  lightweight-charts drawing surface.
- Pine preview in `PineEditorPage` still uses `@tv/chart-engine`.
- Drawing persistence still uses the existing drawing document shape.
- Some package/file names still include `tenant` as legacy naming for a
  user-scoped context. Treat the behavior, not the name, as authoritative.

## Locked Direction

1. Personal single-owner platform. Do not rebuild SaaS billing, quotas, tenant
   isolation, public token APIs, paid spaces, or social marketplace features.
2. TypeScript strict mode everywhere.
3. Zod validation at API and external boundaries.
4. User-owned data must be scoped by authenticated `userId`.
5. KLineChart Pro is the primary chart direction because it provides a built-in
   drawing suite and chart UX.
6. Do not delete the lightweight-charts stack until `/layout`, Pine preview, and
   tests have been migrated.

## Stack

| Area | Current tech |
| --- | --- |
| Frontend | Vite, React 18, TanStack Query, Zustand |
| Main chart | KLineChart Pro + klinecharts |
| Legacy chart surfaces | lightweight-charts + `@tv/chart-engine` + `@tv/drawing-tools` |
| Backend | Hono on Bun |
| Database | PostgreSQL 16 + TimescaleDB |
| Infra | Redis, MinIO, Meilisearch, Mailpit |
| Market data | Native Binance REST/WS plus adapter packages |
| Tests | Bun tests + Playwright |

## Important Paths

| Path | Purpose |
| --- | --- |
| `apps/web/src/chart/KLineProChart.tsx` | React wrapper for KLineChart Pro |
| `apps/web/src/chart/klinepro-datafeed.ts` | KLineChart Pro datafeed over existing API/WS |
| `apps/web/src/pages/ChartProPage.tsx` | Main chart page used by `/chart` and `/chart-pro` |
| `apps/web/src/pages/DashboardPage.tsx` | Trading desk dashboard |
| `apps/web/src/components/ChartPanel.tsx` | Legacy `/layout` chart panel |
| `apps/web/src/pages/PineEditorPage.tsx` | Pine editor with legacy chart preview |
| `apps/server/src/middleware/tenant.ts` | Legacy name, current user-scoped auth middleware |
| `packages/core/src/tenant.ts` | Legacy name, current `{ userId }` context |
| `packages/auth/src/owner.ts` | Idempotent owner account bootstrap/repair helper |
| `packages/cli/src/index.ts` | `tvctl ensure-owner` owner bootstrap command |
| `packages/db/src/schema/remaining.ts` | User-owned app tables |
| `packages/db/src/schema/market.ts` | Market-data tables |

## Next Work

1. **Complete KLineChart Pro migration**
   - Replace `/layout` panels with KLineChart Pro or a klinecharts core panel.
   - Migrate Pine preview away from `@tv/chart-engine`.
   - Decide the final drawing persistence format for KLineChart Pro overlays.
   - Then remove `@tv/chart-engine`, `@tv/drawing-tools`,
     `lightweight-charts`, and `lightweight-charts-drawing`.

2. **Harden the single-user cleanup**
   - Rename legacy `tenant*` symbols to `userContext` where it reduces confusion.
   - Remove stale `DATABASE_URL_ADMIN`, `tv_app`, and public-rate-limit env
     leftovers once services/tools no longer reference them.
   - Rename leftover DB indexes that still contain `tenant` in their names.

3. **Keep product surfaces focused**
   - Trading desk dashboard
   - Main chart
   - Layouts
   - Pine tools
   - Alerts
   - Portfolios and paper trading
   - Brokers
   - Options and backtests
   - Discovery

## Verification

Focused checks:

```bash
pnpm --filter @tv/web typecheck
pnpm --filter @tv/server typecheck
pnpm --filter @tv/web test
pnpm --filter @tv/server test
```

Full gate:

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm e2e
```

Runtime smoke:

```bash
pnpm dev:restart
curl -fsS http://localhost:3101/health
open http://localhost:5187/chart/BTCUSDT
```
