# Architecture

tradingviu is a single-owner trading terminal. It was once a multi-tenant SaaS;
that model is gone. Where old code or comments still say `tenant`, RLS,
super-admin, `tv_app`, or `/v1` public API, read it as legacy naming for a
user-scoped concept — not a requirement to honor.

## Shape

```
Web (apps/web)  ->  Hono API on Bun (apps/server)  ->  domain packages + ingest services
                                                    ->  Postgres + TimescaleDB, Redis, MinIO, Meilisearch
                                                    ->  market / news / calendar / broker providers
```

- `apps/*` deployables, `packages/*` libraries, `services/*` workers, `tools/*` CLIs.
- Frontend talks only to the API. The API reaches providers through
  packages/services, never ad hoc in route code.
- TypeScript strict end to end, ESM only, Zod at API and external boundaries.

## Auth & scope

- First-party email/password (Argon2id) + 7-day HS256 JWT.
- Request context is `{ userId }`. User-owned rows scope by `user_id`.
- No tenants, RLS, super-admin, or public token API in the live model.
- `tvctl ensure-owner` bootstraps/repairs the single owner from `.env`.

## Data

- **Global reference data** (not user-scoped): `exchanges`, `symbols`, news,
  calendars, fundamentals, yield curves, macro series.
- **Market history**: Timescale hypertable `bars`. Binance uses native REST
  klines; CCXT is the fallback for other providers.
- **User-owned**: watchlists, layouts, drawings, alerts, portfolios, paper
  accounts, broker connections, user indicators, backtests, screener presets.
- Broker credentials are encrypted at rest with libsodium (`CRED_ENC_KEY`).

## Real-time data layer

- One upstream per `(provider, ticker, interval)`, shared across all clients —
  the server-side `BarStore` (`market-store.ts`), backed by an in-memory ring
  buffer and persisted to `bars`.
- `market-data.ts` is the single freshness-aware source of historical bars, used
  by chart history, indicators, patterns, profiles, Pine, backtests, alerts, and
  portfolio analytics.
- One WebSocket at `/ws`. Messages include `subscribe_market`, `market_status`,
  `quote`, and `book`. The chart's history cache is the candle source of truth;
  live bars upsert it.

## Charting

- `/chart` and `/chart/:symbol` render `ChartProPage` → `KLineProChart`
  (KLineChart Pro) over `klinepro-datafeed.ts`, which adapts `/api/symbols`,
  `/api/chart/history`, and `/ws`.
- `/layout` tiles `KLineProChartPanel` (KLineChart Pro) with synced bar replay and
  drawing persistence via `@tv/drawing-tools`.
- Legacy remaining: only the Pine preview still uses `@tv/chart-engine`
  (lightweight-charts). Keep that stack until Pine is migrated; everything else is
  on KLineChart Pro.

## API

- The Hono app mounts everything under `/api` (`apps/server/src/index.ts`), one
  route module per domain in `apps/server/src/routes/`. No `/v1` public API.

## Key paths

| Path | Purpose |
| --- | --- |
| `apps/server/src/index.ts` | API entry, route mounts, `/ws` |
| `apps/server/src/routes/*` | one module per domain |
| `apps/server/src/services/market-store.ts` | live upstream + ring buffer |
| `apps/server/src/services/market-data.ts` | freshness-aware history |
| `apps/web/src/App.tsx` | web shell + routes |
| `apps/web/src/chart/KLineProChart.tsx` | KLineChart Pro wrapper |
| `apps/web/src/pages/*` | one page per surface |
| `apps/web/src/styles/index.css` | global styles / design tokens |
| `packages/db/src/schema/*` | Drizzle schema (market + user-owned) |

## Commands

```bash
pnpm dev:infra        # docker infra
pnpm db:migrate       # apply migrations (run pnpm db:generate after schema changes)
pnpm dev:restart      # run web + api
pnpm lint && pnpm typecheck && pnpm test
```
