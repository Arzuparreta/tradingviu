# Architecture

`tradingviu` is currently a single-owner personal trading platform. It used to be
a multi-tenant SaaS clone; that model was deliberately removed.

## Runtime Shape

```
Web / future desktop / future mobile
  -> Hono API on Bun
  -> domain services and ingest workers
  -> PostgreSQL + TimescaleDB, Redis, MinIO, Meilisearch
  -> market/news/calendar/broker providers
```

## Auth And Scope

- Auth is first-party email/password with Argon2id and a 7-day HS256 JWT.
- Runtime request context carries `{ userId }`.
- User-owned tables scope by `user_id`.
- There is no tenant table, tenant membership, tenant role, RLS policy layer, or
  `tv_app` runtime role in the current model.
- Signup creates a user directly; no workspace or super-admin bootstrap exists.

## Data

- Market reference data (`exchanges`, `symbols`) is global.
- Market history lives in Timescale-backed `bars`.
- User-owned data includes watchlists, layouts, drawings, alerts, portfolios,
  paper accounts, broker connections, user indicators, and backtests.
- Discovery data includes news, earnings, dividends, economic events,
  fundamentals, yield curves, and macro series.

## Charting

- `/chart` and `/chart/:symbol` use KLineChart Pro through
  `apps/web/src/chart/KLineProChart.tsx`.
- `/chart-legacy` keeps the old lightweight-charts page reachable for
  transition tests while `/layout` and Pine still depend on that stack.
- The KLineChart Pro datafeed adapts existing API and WS endpoints:
  `/api/symbols`, `/api/chart/history`, and `/ws`.
- `/layout` and Pine preview still use the legacy lightweight-charts surface.
  Do not remove `@tv/chart-engine`, `@tv/drawing-tools`, or
  `lightweight-charts` until those surfaces have been migrated and tested.

## Boundaries

- Frontend calls only the API.
- API provider access goes through packages/services, not ad hoc route code.
- Broker credentials are encrypted at rest with libsodium using `CRED_ENC_KEY`.
- API edges and external payloads should remain Zod-validated.

## Operational Commands

```bash
pnpm dev:infra
pnpm db:migrate
pnpm db:seed
pnpm dev:restart
pnpm typecheck
pnpm test
```
