# Roadmap & Status

> **Read this first** if you're a new agent picking up this repo. It tells you what the project is, where it is, what's left, and the decisions you must respect.

## TL;DR

`tradingviu` is a self-hosted, multi-tenant TradingView clone. AGPL-3.0. Monorepo. TypeScript end-to-end. **Slice 1 (foundation), Slice 2 (indicators + live bars + watchlists), and Slice 3 (Pine Script + multi-chart + search) are done and committed.** This doc maps the full scope so you can keep building.

## Status

| Slice | Scope | Status |
|---|---|---|
| 0 | Cimientos (monorepo, DB, auth, plans, charts) | ✅ done (`cf23b90`) |
| 1 | Indicators (31), live WS bars, watchlists | ✅ done (`39a6465`) |
| 2 | Pine Script v5 subset + interpreter, multi-chart layout (1/2/4/8/16), Meili search | ✅ done (`ac02b78`) |
| 3 | Alerts engine (price/indicator/multi-condition + channels), portfolios CRUD, paper trading engine | ⏳ next |
| 4 | Broker adapters (Alpaca, IBKR, Binance live trading), DOM, chart trading, options chain + strategy builder | pending |
| 5 | News aggregator, calendars (earnings/economic/dividends), yield curves, fundamentals, screener | pending |
| 6 | Social (ideas, comments, follows, scripts marketplace, paid spaces) | pending |
| 7 | Desktop (Tauri) + Mobile (React Native) + push notifications | pending |
| 8 | Volume footprint, TPO, Bar Replay multi-chart, custom intervals, auto chart patterns | pending |
| 9 | Public API + plugin SDK + ecosystem | pending |

The product is "TradingView-equivalent" — every feature of TV (including premium) should eventually be there. We're working vertical slices that maximize user value per unit of work.

## Architectural decisions (locked)

These are **decisions, not suggestions**. A new agent must not change them without a strong reason.

1. **Multi-tenant with RLS at the DB level.** Every data table has `tenant_id` and RLS policies. Application code must never query cross-tenant. See `packages/db/src/rls-policies.ts` for the full policy set.
2. **Two Postgres roles:**
   - `tradingviu` (superuser, BYPASSRLS) → only for migrations, admin operations, signup flow, super admin endpoints. Connection URL: `DATABASE_URL_ADMIN`.
   - `tv_app` (no superuser, RLS-enforced) → all runtime requests. Connection URL: `DATABASE_URL`.
   - Without this split, the app role would bypass RLS and tenant isolation would be broken. This was a critical bug fixed during slice 1.
3. **Transactions required for RLS context.** `set_config('app.tenant_id', ...)` is per-connection. `postgres.js` uses a pool, so a query can land on a different connection than the `set_config`. **Always wrap multi-statement work in `db.transaction()`** and set RLS inside the transaction. See `apps/server/src/middleware/tenant.ts`.
4. **Tenant resolution from JWT.** Every `/api/*` request goes through `tenantContext` middleware which:
   - Verifies JWT (HS256, 7d, httpOnly cookie + Authorization header)
   - Resolves tenant + membership in a super_admin transaction (chicken-and-egg: can't query with tenant context until we know the tenant)
   - Then runs the handler in a second transaction with the right RLS context
5. **First signup = super admin.** Every subsequent signup = regular user. Super admin bypasses RLS. See `apps/server/src/routes/auth.ts`.
6. **License: AGPL-3.0.** See `LICENSE`. Any fork that offers the code as a service must also open-source. This is intentional.
7. **TypeScript strict mode everywhere.** `tsconfig.base.json` enables `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, etc. Don't relax these.
8. **Zod at every API edge, DB row, external payload.** Schema-first. Define in `packages/core`, import everywhere.
9. **Errors as typed classes.** `packages/core/src/errors.ts` exports `TvError` and subclasses. Never throw raw `Error`. The Hono error handler in `apps/server/src/middleware/error.ts` converts them to JSON.
10. **WebSocket auth via token in query string.** `wss://host/ws?token=<jwt>`. Auth on the upgrade request via the same JWT verify as HTTP.

## Stack (locked)

| Layer | Tech | Why |
|---|---|---|
| Language | TypeScript | Same language everywhere |
| Frontend | Vite + React 18 + Zustand + TanStack Query | Fast build, simple state, server state caching |
| Editor (Pine) | Monaco | Same as VS Code |
| Charts | `tradingview/lightweight-charts` + custom plugin layer (footprint, TPO, replay) | Apache 2.0, render canvas, fastest option |
| Desktop | Tauri 2 | 80% lighter than Electron |
| Mobile | React Native + lightweight-charts wrapper | Sync 100% |
| Backend | Hono on Bun (HTTP + WebSocket same process) | One runtime, native WS, fast cold start |
| DB | PostgreSQL 16 + TimescaleDB + RLS | RLS for multi-tenant, hypertables for time series |
| Cache/pubsub | Redis 7 | RT tick fanout, rate limit |
| Object storage | MinIO | S3-compatible, self-hosted |
| Search | Meilisearch | Fast, typo-tolerant, easy |
| ORM | Drizzle | Type-safe SQL, no heavy ORM |
| Auth | Argon2id + jose (HS256 JWT) | Modern, no third-party lock-in |
| Billing | Stripe (scaffolded, optional) | Disabled without keys |
| Build | pnpm + Turborepo | Fast, monorepo-native |
| Tests | bun test + Playwright | Bun-native, fast |
| CI | GitHub Actions (not set up yet) | Add when repo is public |

## Monorepo layout

```
tradingviu/
├── packages/                    # libraries (imported by apps/services)
│   ├── core/                    # types, errors, RLS helpers, env, time, ids
│   ├── data-types/              # Bar, Quote, Trade, Symbol, Provider
│   ├── db/                      # Drizzle schema, RLS policies, client, seed, migrate
│   ├── auth/                    # password, JWT, signup
│   ├── quotas/                  # plan enforcement (used in middleware)
│   ├── billing/                 # Stripe scaffold (checkout, portal, webhook)
│   ├── data-adapters/           # CCXT providers (Binance, Coinbase, Kraken, Bybit)
│   ├── chart-engine/            # wrapper over lightweight-charts (themes, series helpers)
│   ├── ta-lib/                  # 31 technical indicators (TS port)
│   ├── pine-parser/             # Pine Script v5 subset PEG grammar (peggy) → AST
│   ├── pine-runtime/            # AST interpreter (sandboxed, no eval), series math
│   ├── drawing-tools/           # [TODO] 110+ drawing primitives
│   ├── indicators/              # [TODO] indicator catalog with display info
│   ├── screener-engine/         # [TODO] SQL-based screener
│   ├── alert-engine/            # [TODO] rule evaluator (price/indicator/multi-condition)
│   ├── backtest-engine/         # [TODO] strategy simulator
│   ├── paper-trading/           # [TODO] fill models, paper accounts
│   ├── broker-adapters/         # [TODO] Alpaca, IBKR, Binance
│   ├── social/                  # [TODO] ideas, comments, follows
│   ├── news/                    # [TODO] aggregator
│   ├── calendar/                # [TODO] earnings/economic/dividends
│   ├── portfolio/               # [TODO] P&L, holdings, transactions
│   ├── layout-sync/             # multi-chart layout schema + grid presets + helpers
│   ├── ui-kit/                  # [TODO] shared React components
│   ├── cli/                     # tvctl operator CLI (tenants, users, plans)
│   └── billing/                 # Stripe
├── apps/
│   ├── web/                     # React + Vite (port 5173)
│   ├── desktop/                 # [TODO] Tauri 2
│   ├── mobile/                  # [TODO] React Native
│   └── server/                  # Hono on Bun (port 3001)
├── services/                    # [TODO] background workers (data-ingest, alert-runner, etc.)
├── infra/
│   ├── docker-compose.yml       # postgres, redis, minio, meili, mailpit, caddy, api, web
│   ├── Caddyfile
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   ├── nginx.conf
│   └── postgres-init/           # 01-extensions.sql, 02-app-role.sql (RLS setup)
├── docs/
│   ├── ROADMAP.md               # ← this file
│   ├── ARCHITECTURE.md          # layers, multi-tenancy, WS protocol
│   ├── SLICE-1.md               # what slice 1 delivered
│   ├── SLICE-2.md               # what slice 2 delivered
│   └── SELF_HOST.md             # how to deploy on a VPS
├── AGENTS.md                    # conventions (read first)
├── LICENSE                      # AGPL-3.0
└── README.md
```

## What each slice delivers

### Slice 1 (done) — Foundation
- Multi-tenant DB with RLS (Postgres+TimescaleDB)
- Signup/login (Argon2id + JWT)
- Public sign-up with auto-provisioned tenant; first signup = super admin
- Plan system: Free / Essential / Plus / Premium / Ultimate with quotas
- Stripe scaffold (checkout, portal, webhook) — disabled without keys
- CCXT data adapter for crypto (Binance, Coinbase, Kraken, Bybit)
- Hono on Bun, transactional tenant middleware
- React web app: login, signup, dashboard, chart, admin
- tvctl operator CLI
- Docker Compose for self-hosting

### Slice 2 (done) — Indicators + Live bars + Watchlists
- `packages/ta-lib` with 31 indicators (overlap, momentum, volatility, volume, trend)
- Zod-validated parameters
- 15 unit tests
- `/api/indicators` (list) + `/api/indicators/compute` (compute on bars)
- WebSocket via Bun native upgrade; per-connection subscriptions
- Live bars via CCXT polling (1s interval) with broadcast fanout
- `wsHandlers` in `apps/server/src/services/ws.ts` — auth via token in query string
- Watchlists full CRUD with RLS isolation
- Chart UI: interval selector, indicator dropdown, multi-pane with bands, WS live updates

### Slice 3 (next) — Pine Script + Multi-chart + Search
- **Pine Script v5 subset parser** — PEG grammar (peggy) → AST. Subset: indicators, plots, plotshape, inputs, request.security, ta.* builtins, simple strategies.
- **Pine interpreter** — AST-walk in TS, sandboxed, no eval.
- **Pine editor** — Monaco with autocomplete (LSP-style).
- **Multi-chart layout** — 1/2/4/8/16 charts per tab, symbol/timeframe sync.
- **Custom intervals** — seconds, range bars, tick bars.
- **Meilisearch** — full-text search on symbols, ideas, scripts.
- **Layouts persistence** — save/load workspace configurations.

### Slice 4 — Alerts + Portfolios + Paper trading
- Alert engine: price, indicator, multi-condition
- Channels: in-app, email (Postmark), webhook
- Portfolios CRUD with P&L, transactions, dividends
- Paper trading engine with fill models (instant, partial, slippage)
- Risk metrics (Sharpe, drawdown, win rate)

### Slice 5 — Brokers + DOM + Options
- Alpaca, IBKR (Client Portal API), Binance live trading adapters
- DOM (depth of market) and chart trading
- Options chain + strategy builder (verticals, condors, butterflies)
- Volatility surface
- Greeks + P&L profile

### Slice 6 — News + Calendars + Screener
- News aggregator (NewsAPI, Finnhub, Benzinga)
- Brand news by symbol
- Calendars: earnings, economic, dividends
- Yield curves multi-country
- Macroeconomics: 80+ countries, 400+ metrics
- Screener with 400+ filters, auto-refresh

### Slice 7 — Social
- Ideas (chart snapshot + text)
- Comments, likes, follows
- Scripts marketplace (public/invite-only/protected/paid)
- Paid Spaces (subscription channels)

### Slice 8 — Desktop + Mobile
- Tauri 2: multi-monitor, system tray, native push
- React Native: iOS + Android, full sync

### Slice 9 — Advanced TA
- Volume Footprint (candle-by-candle volume distribution)
- TPO (Time Price Opportunity)
- Bar Replay multi-chart
- Auto chart patterns
- Candlestick pattern recognition
- Ichimoku cloud rendering

### Slice 10 — Ecosystem
- Public REST + WebSocket API
- OpenAPI spec
- Webhook out
- Plugin SDK
- Pine v6 compatibility (matrices, maps, UDTs, methods)

## Working with this codebase

### Quick local dev
```bash
# 1. Start infrastructure
docker compose -f infra/docker-compose.yml up -d postgres redis

# 2. Configure
cp .env.example .env
# Edit .env: set JWT_SECRET (32+ chars), CRED_ENC_KEY (64 hex chars), POSTGRES_PASSWORD

# 3. Install + migrate + seed
pnpm install
pnpm db:migrate
pnpm db:seed

# 4. Dev
pnpm dev
# → web on http://localhost:5173
# → api on http://localhost:3001
```

### Testing E2E
```bash
# Run any .sh test script in /tmp/ for E2E
bash /tmp/run-e2e.sh        # slice 1 tests
bash /tmp/run-slice2.sh     # slice 2 tests
bash /tmp/run-ws-test.sh    # WebSocket live test
```

### Key files to know

| File | What it does |
|---|---|
| `apps/server/src/index.ts` | Server entrypoint, route mounting, WS upgrade |
| `apps/server/src/middleware/tenant.ts` | JWT verify + transactional RLS context (the most subtle code) |
| `apps/server/src/middleware/super-admin.ts` | Same but bypasses RLS (gated by `claims.sa`) |
| `apps/server/src/middleware/error.ts` | TvError → JSON response |
| `apps/server/src/routes/auth.ts` | Signup, login, /me — uses admin connection for cross-tenant inserts |
| `apps/server/src/services/ws.ts` | WebSocket handlers, broadcast, CCXT subscribe |
| `apps/server/src/services/data.ts` | CCXT provider registry |
| `apps/web/src/pages/ChartPage.tsx` | The chart UI: indicators, live bars, multi-pane |
| `apps/web/src/pages/WatchlistsPage.tsx` | Watchlist CRUD UI |
| `packages/db/src/rls-policies.ts` | Full RLS policy definitions |
| `packages/db/src/seed.ts` | Plan + exchange + symbol seed |
| `packages/ta-lib/src/registry.ts` | All 31 indicators with their params |
| `packages/auth/src/signup.ts` | Signup flow (chicken-and-egg tenant context) |
| `infra/postgres-init/02-app-role.sql` | Creates the `tv_app` role that respects RLS |
| `.env.example` | All env vars documented |

### Common pitfalls

1. **Forgetting `db.transaction()` for RLS work** — the `set_config` calls and queries must run on the same connection. Without transaction, you'll see "Tenant membership missing" or wrong tenant returns.
2. **Using `DATABASE_URL` (tv_app role) for admin operations** — admin endpoints that bypass RLS (signup, super admin) need the admin connection. Look at how `auth.ts` does it.
3. **Adding data to global tables (exchanges, symbols) without super_admin** — RLS lets everyone read these, but only super_admin can write.
4. **Schema files use `*.js` imports** — Drizzle's bundler requires it. Don't change to `.ts` imports.
5. **Loading env twice in same process** — `loadEnv()` is cached. If you need a new var, add it to `EnvSchema` in `packages/core/src/env.ts`.
6. **The CcxtProvider's `subscribe` doesn't use `watchOHLCV`** — Binance in CCXT 4.5 doesn't support it directly. It polls `fetchOHLCV` every 1s. Reliable, but not real WS. Other exchanges (Bybit, Kraken) might support `watchOHLCV` better.

### How to add a new indicator

1. Implement the function in the appropriate file (`overlap.ts`, `momentum.ts`, etc.)
2. Add a schema entry in `SCHEMAS` in `registry.ts`
3. Add a `wrap(...)` call to `SPECS` array
4. Write a test in `registry.test.ts` or `slice2.test.ts`
5. Run `pnpm --filter @tv/ta-lib test`
6. Commit

### How to add a new API route

1. Create a new file in `apps/server/src/routes/`
2. Define a `new Hono()` with `.get/.post/...` handlers
3. Mount in `apps/server/src/index.ts` with `app.route('/api', yourRoutes)`
4. If the route needs tenant context, mount it AFTER `app.use('/api/*', tenantContext({ ... }))`
5. If the route is super-admin only, mount under `/admin/*` so `superAdminContext` middleware applies

### How to add a new DB table

1. Add the table definition in `packages/db/src/schema/tenants.ts` (or `remaining.ts`)
2. Export from `packages/db/src/schema/index.ts`
3. Add to the `tables` array in `packages/db/src/rls-policies.ts` (if it has `tenant_id`)
4. Run `pnpm db:generate` to create the migration
5. Run `pnpm db:migrate` to apply
6. Update seed if needed

## Success criteria for the next agent

When you pick up this repo, you should be able to:
1. Read this file and know exactly where the project is and where to go next.
2. Run `pnpm install && pnpm dev` and see the dashboard, chart with live bars, and watchlists.
3. Pick slice 3 and start with Pine Script parser OR multi-chart layout (whichever has more value to you).
4. Not have to re-discover the RLS/transactions gotcha — it's documented here.

If something is unclear, fix the docs. If something is broken, fix the code. If something is missing, build it.
