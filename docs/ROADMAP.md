# Roadmap & Status

> **Read this first** if you're a new agent picking up this repo. It tells you what the project is, where it is, what's left, and the decisions you must respect.

## TL;DR

`tradingviu` is a self-hosted, multi-tenant TradingView clone. AGPL-3.0. Monorepo. TypeScript end-to-end. **Slice 1 (foundation), Slice 2.5 (real-time market data infrastructure), Slice 3 (Pine Script + multi-chart + search), Slice 4 (alerts + portfolios + paper trading), and Slice 5 (trading desk) are done and committed.** Slice 2.5 supersedes the broken live-bars polling from slice 2 with a single-upstream BarStore, TimescaleDB persistence, paginated history, and a status-aware WS protocol. Slice 6 is in progress with news (mock + NewsAPI + Finnhub), earnings/economic/dividend calendars, screener presets, fundamentals storage + ingestion, yield curves, macro series ingestion, calendar provider ingestion, and an expanded screener (catalog of ~90 metrics, generic filter builder, auto-refresh) delivered. Slice 9 (advanced TA) is done (9a–9g): candlestick pattern recognition, auto chart-pattern detection, volume profile, TPO/Market profile, single- and multi-chart bar replay, and Ichimoku cloud — only per-candle footprint is deferred (needs a trade tape). Slice 11 (strategy backtesting) is in progress: a deterministic simulator with three built-in strategies, equity curve, and full performance stats. This doc maps the full scope so you can keep building.

## Status

> Slice numbers are 1-indexed and match the `docs/SLICE-N.md` files and the "What each slice delivers" section below.

| Slice | Scope                                                                                                      | Status                   |
| ----- | ---------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1     | Foundation (monorepo, DB, auth, plans, charts)                                                             | ✅ done (`cf23b90`)      |
| 2     | Indicators (31), live WS bars, watchlists                                                                  | ✅ done (`39a6465`), **superseded by 2.5** |
| 2.5   | Real-time market data: BarStore (1 upstream per key, fanout), TimescaleDB hypertable, paginated history, status events, in-progress bars, timezone-correct chart | ✅ done (this slice)     |
| 3     | Pine Script v5 subset + interpreter, multi-chart layout (1/2/4/8/16), Meili search                         | ✅ done (`ac02b78`)      |
| 4     | Alerts engine (price/indicator/multi-condition + channels), portfolios CRUD, paper trading engine          | ✅ done (`4fd3fd3`)      |
| 5     | Broker adapters (Alpaca, IBKR, Binance live trading), DOM, chart trading, options chain + strategy builder | ✅ done                  |
| 6     | News aggregator, calendars (earnings/economic/dividends), yield curves, fundamentals, screener             | in progress (6a–6l done) |
| 7     | Social (ideas, comments, follows, scripts marketplace, paid spaces)                                        | in progress (7a–7e done) |
| 8     | Desktop (Tauri) + Mobile (React Native) + push notifications                                               | pending                  |
| 9     | Candlestick patterns, volume footprint, TPO, Bar Replay multi-chart, auto chart patterns                   | ✅ done (9a–9g; footprint deferred — needs trade tape) |
| 10    | Public API + plugin SDK + ecosystem                                                                        | pending                  |
| 11    | Strategy backtesting (deterministic simulator, built-in strategies, equity/stats)                          | in progress (11a–11b done) |

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

| Layer          | Tech                                                                            | Why                                               |
| -------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| Language       | TypeScript                                                                      | Same language everywhere                          |
| Frontend       | Vite + React 18 + Zustand + TanStack Query                                      | Fast build, simple state, server state caching    |
| Editor (Pine)  | Monaco                                                                          | Same as VS Code                                   |
| Charts         | `tradingview/lightweight-charts` + custom plugin layer (footprint, TPO, replay) | Apache 2.0, render canvas, fastest option         |
| Desktop        | Tauri 2                                                                         | 80% lighter than Electron                         |
| Mobile         | React Native + lightweight-charts wrapper                                       | Sync 100%                                         |
| Backend        | Hono on Bun (HTTP + WebSocket same process)                                     | One runtime, native WS, fast cold start           |
| DB             | PostgreSQL 16 + TimescaleDB + RLS                                               | RLS for multi-tenant, hypertables for time series |
| Cache/pubsub   | Redis 7                                                                         | RT tick fanout, rate limit                        |
| Object storage | MinIO                                                                           | S3-compatible, self-hosted                        |
| Search         | Meilisearch                                                                     | Fast, typo-tolerant, easy                         |
| ORM            | Drizzle                                                                         | Type-safe SQL, no heavy ORM                       |
| Auth           | Argon2id + jose (HS256 JWT)                                                     | Modern, no third-party lock-in                    |
| Billing        | Stripe (scaffolded, optional)                                                   | Disabled without keys                             |
| Build          | pnpm + Turborepo                                                                | Fast, monorepo-native                             |
| Tests          | bun test + Playwright                                                           | Bun-native, fast                                  |
| CI             | GitHub Actions (not set up yet)                                                 | Add when repo is public                           |

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
│   ├── candlestick-patterns/    # 22 candlestick pattern detectors (slice 9a)
│   ├── chart-patterns/          # 11 auto chart-pattern detectors over swing pivots (slice 9b)
│   ├── volume-profile/          # volume-at-price engine: POC, value area, buy/sell delta (slice 9c)
│   ├── tpo-profile/             # TPO / Market Profile engine: letter ladder, POC, value area, IB, single prints (slice 9d)
│   ├── ichimoku/                # Ichimoku engine: Tenkan/Kijun/Senkou A-B/Chikou + displaced cloud (slice 9f)
│   ├── pine-parser/             # Pine Script v5 subset PEG grammar (peggy) → AST
│   ├── pine-runtime/            # AST interpreter (sandboxed, no eval), series math
│   ├── drawing-tools/           # [TODO] 110+ drawing primitives
│   ├── indicators/              # [TODO] indicator catalog with display info
│   ├── screener-engine/         # [TODO] SQL-based screener
│   ├── alert-engine/            # (placeholder — alert evaluator lives in apps/server/src/services/alert-engine.ts)
│   ├── backtest-engine/         # deterministic strategy simulator: 3 built-ins, trades, equity curve, stats (slice 11)
│   ├── paper-trading/           # (placeholder — fill model lives in apps/server/src/services/paper-trading.ts)
│   ├── options-engine/          # Black-Scholes pricing, greeks, IV, chain, strategy builder + payoff
│   ├── broker-adapters/         # [TODO] Alpaca, IBKR, Binance live trading (slice 5b)
│   ├── social/                  # [TODO] ideas, comments, follows
│   ├── news/                    # provider contract + mock/NewsAPI adapters (ingest worker in services/)
│   ├── calendar/                # earnings/economic/dividend provider contract + mock/FMP adapters
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
├── services/                    # background workers: news-ingest, fundamentals-ingest, macro-ingest, calendar-ingest
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
│   ├── SLICE-3.md               # what slice 3 delivered
│   ├── SLICE-4.md               # what slice 4 delivered
│   ├── SLICE-5.md               # what slice 5 delivers (5a options engine)
│   ├── SLICE-9.md               # what slice 9 delivers (9a–9g: patterns, chart patterns, volume profile, TPO, bar replay, Ichimoku)
│   ├── SLICE-11.md              # what slice 11 delivers (11a–11b: backtest engine, built-in strategies, Pine signal backtest)
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

### Slice 2.5 (done) — Real-time market data infrastructure

- **BarStore** (`apps/server/src/services/bar-store.ts`) — single upstream per `(provider, ticker, interval)`, ref-counted subscriptions, ring buffer (5000 bars) per key, 60s idle grace period before closing upstream
- **Stream layer** (`apps/server/src/services/streams/`) — Binance native WS (`wss://stream.binance.com:9443/ws/<sym>@kline_<tf>`) and CCXT polling fallback for Coinbase/Kraken/Bybit; emits `{kind: 'update' | 'close', bar}` events; auto-reconnect with exponential backoff
- **PersistQueue** (`apps/server/src/services/persist-queue.ts`) — batched writes to `bars` table (100ms window, max 500/batch), idempotent via `ON CONFLICT … DO UPDATE`
- **TimescaleDB hypertable** `bars(provider, ticker, interval, time, ohlc, volume, is_closed)` — 1-day chunks, public read, super_admin write
- **Paginated history** — `GET /api/chart/history?symbol=&interval=&before=&after=&limit=`, BarStore-first with DB and exchange fallbacks
- **WS protocol additions** — `bar` event now carries `phase: 'update' | 'close'`; new `status` event (`connecting | live | reconnecting | down | idle`)
- **Backfill CLI** (`pnpm backfill:bars`) — idempotent seed from CCXT for any `(provider, ticker, interval)` combo
- **Client** — `useChartHistory` (paginated, `loadMore`, dedup), `useBarStream` (auto-reconnect, status), `subscribeVisibleTimeRange` triggers `loadMore` on scroll-left, `chart-engine` uses local timezone
- **Test coverage** — `bar-store.test.ts` (ring buffer, ref-count, range query, fanout, deactivation), `persist-queue.test.ts` (batching, retry, stop), extended `binance.test.ts` (in-progress bar, close on time change)
- See [`docs/SLICE-2.5.md`](SLICE-2.5.md) for the full design.

### Slice 3 (done) — Pine Script + Multi-chart + Search

- **Pine Script v5 subset parser** — PEG grammar (peggy) → AST. Subset: indicators, plots, plotshape, inputs, request.security, ta.\* builtins, simple strategies.
- **Pine interpreter** — AST-walk in TS, sandboxed, no eval.
- **Pine editor** — Monaco with autocomplete (LSP-style).
- **Multi-chart layout** — 1/2/4/8/16 charts per tab, symbol/timeframe sync.
- **Custom intervals** — seconds, range bars, tick bars.
- **Meilisearch** — full-text search on symbols, ideas, scripts.
- **Layouts persistence** — save/load workspace configurations.

### Slice 4 (done) — Alerts + Portfolios + Paper trading

- Alert engine: price, indicator, multi-condition evaluator
- Channels: in-app delivered now; email/webhook recorded for future workers
- Alerts CRUD + manual evaluation endpoint + alert history
- Portfolios CRUD with transactions, holdings rebuild, dividends, fees, realized P&L
- Paper accounts + market/limit paper orders with instant/pending fills, fees, slippage, buying-power check
- Web app pages: Alerts, Portfolios, Paper
- No DB migration was required: the foundation schema already contained the tenant-scoped tables.

### Slice 5 (done) — Brokers + DOM + Options

- **5a (done) — Options engine:** Black-Scholes pricing, full greeks, implied volatility, option chain, 13-strategy builder (verticals, straddle/strangle, condors, butterflies), expiration payoff (max profit/loss, breakevens, net greeks). Pure `packages/options-engine` + `/api/options/*` + `OptionsPage`. See `docs/SLICE-5.md`.
- **5b (done) — Broker adapters:** `packages/broker-adapters` with Alpaca, Binance Spot/Testnet, and IBKR Client Portal adapters; tenant-scoped `/api/brokers/*` connection routes; libsodium-encrypted credentials in `broker_connections.credentials_encrypted`; `BrokersPage` for connect/test/accounts/positions/orders.
- **5c (done) — DOM + chart trading:** `/api/chart/dom` returns a deterministic depth ladder from recent market bars; `ChartPage` adds a DOM ladder and order ticket; users can click bid/ask levels to prepare limit orders and submit to paper accounts or live broker connections.
- Later — volatility surface, P&L profile across time/vol (not just at expiration)

### Slice 6 — News + Calendars + Screener

- **6a (done) — News + calendars read surface:** Zod-validated `/api/news`, `/api/calendars/earnings`, and `/api/calendars/economic` endpoints over the existing global tables, seeded demo rows, and a `/discovery` web page with symbol/country/range filters. See `docs/SLICE-6.md`.
- **6b (done) — Screener + saved presets:** `packages/screener-engine`, Zod-validated `/api/screener`, tenant-scoped `/api/screener/presets` CRUD, and a screener panel in `/discovery` backed by seeded demo symbol metrics. See `docs/SLICE-6.md`.
- **6c (done) — Dividend calendar:** Global `dividend_calendar` table, RLS policies, Zod-validated `/api/calendars/dividends`, seeded AAPL/MSFT demo rows, and `/discovery` dividend panel. See `docs/SLICE-6.md`.
- **6d (done) — News provider adapters + scheduled ingestion:** `packages/news` provider contract and deterministic mock provider, `services/news-ingest` worker, admin/RLS-safe upsert into `news_articles`, and `pnpm news:ingest`. See `docs/SLICE-6.md`.
- **6e (done) — Fundamentals storage + API:** Global `fundamental_snapshots` table, RLS policies, `/api/fundamentals`, Discovery fundamentals panel, seeded demo fundamentals, and screener metrics switched from `symbols.metadata` to dedicated storage. See `docs/SLICE-6.md`.
- **6f (done) — Yield curves + macro series:** Global `yield_curves` and `macro_series_observations` tables, RLS policies, `/api/macro/yield-curves`, `/api/macro/series`, Discovery rates/macro panel, and seeded demo US rates/macroeconomic observations. See `docs/SLICE-6.md`.
- **6g (done) — Fundamentals provider ingestion:** `packages/fundamentals` provider contract with mock + Polygon adapters, `services/fundamentals-ingest` worker, admin/RLS-safe upsert into `fundamental_snapshots`, and `pnpm fundamentals:ingest`. See `docs/SLICE-6.md`.
- **6h (done) — Yield curve + macro provider ingestion:** `packages/macro` provider contract with mock + FRED adapters, `services/macro-ingest` worker, admin/RLS-safe upserts into `yield_curves` and `macro_series_observations`, and `pnpm macro:ingest`. See `docs/SLICE-6.md`.
- **6i (done) — Calendar provider ingestion:** `packages/calendar` provider contract with mock + FMP adapters, `services/calendar-ingest` worker, admin/RLS-safe upserts into `earnings_calendar`/`dividend_calendar`/`economic_events` (new `economic_events` unique index), and `pnpm calendars:ingest`. See `docs/SLICE-6.md`.
- **6j (done) — Real news provider ingestion:** `NewsApiProvider` (NewsAPI.org `/v2/everything`) in `packages/news` with per-symbol brand-news tagging, `NEWS_PROVIDER=mock|newsapi`, and `NEWSAPI_KEY` wired through `services/news-ingest`. See `docs/SLICE-6.md`.
- **6k (done) — Finnhub news provider:** `FinnhubNewsProvider` in `packages/news` over `/api/v1/company-news` (per-symbol) and `/api/v1/news` (general), unix-second timestamp normalization, `related`-ticker tagging, `NEWS_PROVIDER=mock|newsapi|finnhub`, and `FINNHUB_KEY` wired through `services/news-ingest`. See `docs/SLICE-6.md`.
- **6l (done) — Screener expansion:** `packages/screener-engine` grows from 11
  hardcoded metrics to a grouped **metric catalog** (~90 today; 11 column-backed,
  the rest metadata-backed via a guarded `metadata->>key::float8` cast), a
  generic `filters[]` query shape, NULLS-LAST sorting on any metric, `POST
  /api/screener` + `GET /api/screener/metrics`, and a Discovery **filter builder
  + column picker + click-to-sort + auto-refresh**. Metadata-backed metrics scale
  the catalog toward 400+ with no migration. See `docs/SLICE-6.md`.
- Additional news providers (Benzinga)
- Additional fundamentals providers and broader metric coverage
- Additional macro providers and non-US country mappings

### Slice 7 — Social

- **7a (done) — Ideas CRUD + feed:** tenant-scoped `/api/ideas` (feed/detail/create/update/delete) with public/private visibility, symbol/author/direction filters, author + symbol joins, owner-enforced mutations, Zod schemas in `packages/core/src/social-schemas.ts`, and a web `IdeasPage` at `/ideas`. See `docs/SLICE-7.md`.
- **7b (done) — Comments + likes on ideas:** new target-based `likes` table (migration `0005`, idempotent unique index), comments/likes endpoints under `/api/ideas/:id`, transactional `likesCount`/`commentsCount` counters, per-caller `liked` flag, and like/comment UI on `IdeasPage`. See `docs/SLICE-7.md`.
- **7c (done) — Follows + followed-authors feed:** tenant-scoped `/api/follows` (following/followers/suggestions lists + idempotent follow/unfollow), tenant-membership-validated follow targets, per-caller `author.following` flag on ideas, a `GET /api/ideas?author=following` followed-authors feed, and `IdeasPage` Following tab + per-card Follow button + People panel. No migration (the `follows` table shipped with the foundation schema). See `docs/SLICE-7.md`.
- **7d (done) — Scripts marketplace:** tenant-scoped `/api/scripts` (feed/detail/publish/update/delete/install + favorite/unfavorite over `published_scripts`), public/protected/private visibility with a source-access rule (protected/private source hidden from non-authors), download counting on install, favorites reusing the target-based `likes` table (`target_type='script'`), `priceCents` for paid listings, and a `ScriptsPage` marketplace (filters, sort, favorite, install, owner delete). No migration. See `docs/SLICE-7.md`.
- **7e (done) — Paid Spaces:** three new tables (migration `0006`: `spaces`, `space_subscriptions` entitlement ledger, `space_posts`), tenant-scoped `/api/spaces` (feed/detail/CRUD + subscribe/unsubscribe + gated owner posts), public/private (invite-by-id) visibility, post access gated to owner + active subscribers, a transactionally-maintained `subscribersCount`, `priceCents` paid spaces that grant entitlement on subscribe (Stripe checkout deferred), and a `SpacesPage` (browse, subscribe, gated content, owner composer). See `docs/SLICE-7.md`.
- Later — Stripe-backed checkout in front of paid-space / paid-script entitlements (currently granted directly with billing disabled).

### Slice 8 — Desktop + Mobile

- Tauri 2: multi-monitor, system tray, native push
- React Native: iOS + Android, full sync

### Slice 9 — Advanced TA

- **9a (done) — Candlestick pattern recognition:** `packages/candlestick-patterns` (22 pure,
  deterministic detectors across single/two/three-bar families, trend-aware disambiguation,
  catalog + `detectAll` scanner), `/api/patterns` + `/api/patterns/scan`, a `createMarkers`
  helper in `@tv/chart-engine`, and a **Patterns** toggle on `ChartPage` that overlays
  bullish/bearish markers. See `docs/SLICE-9.md`.
- **9b (done) — Auto chart-pattern detection:** `packages/chart-patterns` (swing-pivot
  detection + 11 deterministic detectors across reversals — double/triple top & bottom,
  head & shoulders, inverse head & shoulders — and continuations — ascending/descending/
  symmetrical triangles, rising/falling wedges), breakout-confirmed matches with
  structural points, neckline/target, and a `[0,1]` confidence; `/api/chart-patterns`
  - `/api/chart-patterns/scan`; and a **Chart Patterns** toggle on `ChartPage` that
    draws each shape as a dashed polyline plus a results panel. See `docs/SLICE-9.md`.
- **9c (done) — Volume Profile:** `packages/volume-profile` (pure, deterministic
  volume-at-price engine — distributes each bar's volume across price bins by
  range overlap, splits buy/sell from the close position for a delta, and computes
  the Point of Control + value area); `POST /api/volume-profile`; and a **Volume
  Profile** toggle on `ChartPage` that overlays POC/VAH/VAL price lines plus a
  buy/sell SVG histogram + stats panel. See `docs/SLICE-9.md`.
- **9d (done) — TPO Profile (Market Profile):** `packages/tpo-profile` (pure,
  deterministic Time-Price-Opportunity engine — groups bars into periods,
  letters each period, counts the periods printing at each price row, and
  computes the Point of Control, value area, Initial Balance, and single
  prints); `POST /api/tpo-profile`; and a **TPO** toggle on `ChartPage` that
  overlays POC/VAH/VAL + IB high/low price lines plus a Market Profile letter
  ladder + stats panel. See `docs/SLICE-9.md`.
- **9e (done) — Bar Replay:** a single-chart replay mode on `ChartPage` that
  reveals historical bars one at a time (play/pause/step/speed + click-to-set
  start), pausing the live stream and pagination while active and clipping
  causal indicators / pattern markers / chart-pattern lines to the cursor's
  time. Pure index/timing math in `apps/web/src/lib/replay.ts` with unit tests.
  No new endpoint — reuses paginated history. See `docs/SLICE-9.md`.
- **9f (done) — Ichimoku Cloud:** `packages/ichimoku` (pure, deterministic
  Tenkan/Kijun/Senkou A-B/Chikou with forward-displaced leading spans + future
  time synthesis and a bullish-flagged cloud array); a `createIchimokuCloud`
  canvas primitive in `@tv/chart-engine` that fills the green/red kumo between
  the spans (twist-split, drawn under the candles); `POST /api/ichimoku`; and an
  **Ichimoku** toggle on `ChartPage` drawing the five lines + cloud, clipped to
  the cursor in Bar Replay. See `docs/SLICE-9.md`.
- **9g (done) — Bar Replay across multi-chart layouts:** a single replay control
  on `LayoutPage` steps every panel together, synced by **cursor time** (not bar
  index) so charts on different symbols/intervals stay aligned. Panels report
  their time bounds via `onBounds`; the layout unions them into a global span and
  drives the shared cursor (play/pause/step/speed), pausing live streams while
  active. Pure time helpers (`clampTime`/`defaultReplayTime`/`isTimeAtEnd`) added
  to `apps/web/src/lib/replay.ts` with tests. See `docs/SLICE-9.md`.
- Per-candle footprint cells (bid/ask split) — **deferred**, needs trade-level data

### Slice 10 — Ecosystem

- Public REST + WebSocket API
- OpenAPI spec
- Webhook out
- Plugin SDK
- Pine v6 compatibility (matrices, maps, UDTs, methods)

### Slice 11 — Strategy Backtesting

- **11a (done) — Backtest engine + built-in strategies:** `packages/backtest-engine`
  (pure, deterministic strategy simulator — 3 built-in strategies: MA cross, RSI
  reversal, Donchian breakout; no-lookahead next-bar-open execution; fees +
  slippage; long/optional-short; trades + equity curve + full stats incl. net
  profit, win rate, profit factor, max drawdown, Sharpe, buy & hold), `POST
  /api/backtest` + `GET /api/backtest/strategies`, and a **Backtest** toggle on
  `ChartPage` with strategy/param/settings controls, entry/exit markers, an
  equity-curve sparkline, and headline stats. See `docs/SLICE-11.md`.
- **11b (done) — Backtest Pine signal series:** the engine core is split into a
  pure `simulate(bars, signals, settings)` + `signalsFromSeries` (sign →
  position); `POST /api/backtest/pine` runs a Pine script and backtests the sign
  of its `signal` plot (reusing the vectorized interpreter, no event-driven order
  engine), and the Pine editor gains a **⚗ Backtest** button + allow-shorts
  toggle + result panel (equity sparkline + stats). See `docs/SLICE-11.md`.
- Later — event-driven Pine `strategy.*` (stops/targets/trailing), a dedicated
  report page, and walk-forward / parameter optimization.

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

| File                                           | What it does                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `apps/server/src/index.ts`                     | Server entrypoint, route mounting, WS upgrade, BarStore boot        |
| `apps/server/src/middleware/tenant.ts`         | JWT verify + transactional RLS context (the most subtle code)       |
| `apps/server/src/middleware/super-admin.ts`    | Same but bypasses RLS (gated by `claims.sa`)                        |
| `apps/server/src/middleware/error.ts`          | TvError → JSON response                                             |
| `apps/server/src/routes/auth.ts`               | Signup, login, /me — uses admin connection for cross-tenant inserts |
| `apps/server/src/routes/alerts.ts`             | Alerts CRUD, evaluation, and history                                |
| `apps/server/src/routes/portfolios.ts`         | Portfolios, transactions, holdings rebuild, P&L metrics             |
| `apps/server/src/routes/paper.ts`              | Paper accounts and market/limit paper orders                        |
| `apps/server/src/routes/options.ts`            | Stateless options pricing/chain/strategy endpoints                  |
| `packages/options-engine/src/black-scholes.ts` | BS pricing, greeks, implied vol                                     |
| `packages/options-engine/src/strategy.ts`      | Strategy templates + payoff/greeks analysis                         |
| `apps/web/src/pages/OptionsPage.tsx`           | Options strategy builder + SVG payoff diagram                       |
| `apps/server/src/services/ws.ts`               | WebSocket fanout via BarStore                                       |
| `apps/server/src/services/bar-store.ts`        | **Slice 2.5** — single upstream per key, ref-counted fanout         |
| `apps/server/src/services/persist-queue.ts`    | **Slice 2.5** — batched writes to `bars` table                      |
| `apps/server/src/services/streams/binance.ts`  | **Slice 2.5** — Binance native WS kline stream                      |
| `apps/server/src/services/streams/ccxt.ts`     | **Slice 2.5** — CCXT polling stream wrapper                         |
| `apps/server/src/services/alert-engine.ts`     | Pure alert condition evaluator                                      |
| `apps/server/src/services/portfolio-engine.ts` | Pure holdings/P&L rebuild logic                                     |
| `apps/server/src/services/paper-trading.ts`    | Pure paper fill model                                               |
| `apps/server/src/services/data.ts`             | CCXT provider registry + BarStore singleton factory                 |
| `apps/web/src/pages/ChartPage.tsx`             | The chart UI: indicators, live bars, multi-pane                     |
| `apps/web/src/hooks/use-chart-history.ts`      | **Slice 2.5** — paginated history hook with `loadMore`              |
| `apps/web/src/hooks/use-bar-stream.ts`         | **Slice 2.5** — WS hook with status + auto-reconnect                |
| `apps/web/src/pages/WatchlistsPage.tsx`        | Watchlist CRUD UI                                                   |
| `packages/db/src/rls-policies.ts`              | Full RLS policy definitions                                         |
| `packages/db/src/seed.ts`                      | Plan + exchange + symbol seed                                       |
| `packages/ta-lib/src/registry.ts`              | All 31 indicators with their params                                 |
| `packages/auth/src/signup.ts`                  | Signup flow (chicken-and-egg tenant context)                        |
| `infra/postgres-init/02-app-role.sql`          | Creates the `tv_app` role that respects RLS                         |
| `tools/backfill-bars/src/index.ts`             | **Slice 2.5** — idempotent CLI to seed `bars` from CCXT             |
| `.env.example`                                 | All env vars documented                                             |

### Common pitfalls

1. **Forgetting `db.transaction()` for RLS work** — the `set_config` calls and queries must run on the same connection. Without transaction, you'll see "Tenant membership missing" or wrong tenant returns.
2. **Using `DATABASE_URL` (tv_app role) for admin operations** — admin endpoints that bypass RLS (signup, super admin) need the admin connection. Look at how `auth.ts` does it.
3. **Adding data to global tables (exchanges, symbols) without super_admin** — RLS lets everyone read these, but only super_admin can write. The `bars` table (slice 2.5) is also super_admin-write; the `PersistQueue` runs inside a transaction with `withSuperAdminRls` to satisfy RLS.
4. **Schema files use `*.js` imports** — Drizzle's bundler requires it. Don't change to `.ts` imports.
5. **Loading env twice in same process** — `loadEnv()` is cached. If you need a new var, add it to `EnvSchema` in `packages/core/src/env.ts`.
6. **BarStore is per-process** — ref-counted fanout works for a single server process. If you scale to multiple processes (PM2 cluster, Kubernetes), each process will open its own upstream per active key. For multi-process fanout, swap in Redis pub/sub (not in slice 2.5). The `bars` table is the cross-process shared state.
7. **The chart's `series.update()` vs `setData()`** — `setData()` replaces all data (used on initial load and `loadMore`); `series.update()` overwrites a single bar (used for in-progress updates). Mixing them up causes the chart to reset on every WS tick. The `useBarStream` hook only calls `series.update()`.

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
3. Continue with Slice 6: news, earnings/economic/dividend calendars, yield curves, fundamentals, and screener.
4. Not have to re-discover the RLS/transactions gotcha — it's documented here.

If something is unclear, fix the docs. If something is broken, fix the code. If something is missing, build it.
