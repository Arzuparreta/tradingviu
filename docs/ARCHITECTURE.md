# Architecture

## Layers

```
Clients (Web, Desktop Tauri, Mobile RN)
   ↓ HTTPS / WSS
Edge (Caddy — TLS, gzip, rate-limit)
   ↓
API Server (Hono on Bun — HTTP + WS same process)
   ↓
Domain services (workers, isolated)
   ↓
State (PostgreSQL+TSDB · Redis · S3 · Meili · NATS)
   ↓
External (CCXT, Alpaca, Polygon, Stripe, Postmark, FRED)
```

## Multi-tenancy

- Every table with tenant data has a `tenant_id` column.
- RLS policies force isolation at the DB level.
- `app.tenant_id` is set per session from JWT claims via `set_config`.
- Drizzle inserts auto-inject `tenant_id` from `AsyncLocalStorage` context.
- Super admin role bypasses RLS for operator actions.

## Auth

- Argon2id for password hashing.
- JWT (HS256) for stateless sessions, 7-day TTL.
- First signup becomes super admin automatically.

## Data sources

- `packages/data-adapters/ccxt` for crypto (Binance, Coinbase, Kraken, Bybit) with WebSocket subscriptions.
- Plug-in adapters for stocks, forex, etc.

## Plan/quotas

- Plan quotas live in `plans.quotas jsonb`.
- `@tv/quotas` exposes `getPlanQuotas(db, planCode)` with a 30s cache.
- `QuotaExceededError` (HTTP 402) on overflow.

## WebSocket protocol

See `packages/core/src/ws-protocol.ts`. Discriminated union schema with Zod for type safety.

## Status

This is slice 1 of Phase 0. What's running:

- Multi-tenant DB with RLS
- Signup/login with auto-provisioning
- Plan/billing stub (Stripe scaffolded, free plan default)
- Symbol catalog (seeded with crypto)
- Chart history endpoint pulling from CCXT
- Web UI: login, signup, dashboard, chart
- tvctl operator CLI
- Docker Compose for self-hosting

Coming in slice 2:

- Watchlists + portfolio + alerts CRUD
- Indicator library (TA-Lib WASM)
- Drawing tools persistence
- Symbol search via Meilisearch
- Provider health monitoring
- Real-time WebSocket bar updates
- Stripe checkout flow end-to-end
