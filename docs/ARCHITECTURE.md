# Architecture

tradingviu is a single-owner market terminal. The active architecture serves
charting, watchlists, layouts, alerts, discovery, and market data. Brokerage,
portfolio, options, Pine, backtesting, papers, SaaS, tenant, billing, and public
API surfaces are out of scope.

## Shape

```
Web (apps/web)  ->  Hono API on Bun (apps/server)  ->  domain packages + ingest services
                                                    ->  Postgres + TimescaleDB, Redis, Meilisearch
                                                    ->  market / news / calendar / fundamentals / macro providers
```

- `apps/*` deployables, `packages/*` active libraries, `services/*` ingest
  workers, `tools/*` CLIs.
- The frontend talks only to the API. Provider access lives in packages or
  services, not ad hoc route code.
- TypeScript strict end to end, ESM only, Zod at API and external boundaries.

## Auth & Scope

- First-party email/password (Argon2id) + 7-day HS256 JWT.
- Request context is `{ userId }`.
- User-owned rows scope by `user_id`.
- No tenants, RLS, super-admin, billing, public token API, or marketplace
  constraints in the live model.

## Data

- **Global reference data**: exchanges, symbols, news, calendars, fundamentals,
  yield curves, macro series, and market history.
- **Market history**: Timescale hypertable `bars`. Binance uses native REST
  klines; CCXT is the fallback for other providers.
- **User-owned active data**: watchlists, layouts, drawings, alerts, and screener
  presets if a discovery workflow needs saved filters.
- Retired trading, broker, portfolio, paper, Pine, and backtest data models are
  removed from the active schema through migrations.

## Real-Time Data Layer

- One upstream per `(provider, ticker, interval)`, shared across all clients.
- The server-side `BarStore` (`market-store.ts`) owns upstreams, in-memory ring
  buffers, fanout, and persistence to `bars`.
- `market-data.ts` is the freshness-aware historical bar source for chart
  history, indicators, patterns, profiles, alerts, and discovery support.
- One WebSocket at `/ws`. Messages include `subscribe_market`, `market_status`,
  `quote`, and `book`.

## Charting

- `/chart` and `/chart/:symbol` render `WorkspacePage`, which tiles
  `KLineChartPanel` instances over a direct `klinecharts` core surface themed
  from the app's CSS tokens (`apps/web/src/chart/theme.ts`).
- React layout state is the source of truth for chart symbol and interval.
  Each panel explicitly loads `/api/chart/history` and subscribes to `/ws` for
  the current `{ symbol, interval }`; stale requests/subscriptions are discarded
  on change.
- `/layout` aliases into the same workspace model, with independent panel state
  and only explicitly useful synchronization.
- Drawing tools are custom klinecharts overlays (`apps/web/src/chart/overlays/`)
  registered on top of the built-ins: channels, pitchfork, fib levels, shapes,
  annotations, measures, and position tools.
- Drawings are symbol-scoped: one set per symbol (`scope symbol:<id>`,
  interval slot pinned to `any`), shared across intervals, panels, layouts, and
  reloads. Types/schemas live in `@tv/core` (`drawing-schemas.ts`).

## API

- The Hono app mounts everything active under `/api`
  (`apps/server/src/index.ts`), one route module per active domain in
  `apps/server/src/routes/`.
- Active route domains: auth, health, symbols/chart, search, indicators,
  patterns, chart patterns, volume profile, TPO profile, Ichimoku, pivot points,
  watchlists, layouts, drawings, alerts, discovery, and screener.
- There is no active `/v1` public API and no active API for brokers, order
  placement, portfolios, paper trading, options, Pine, or backtesting.

## Key Paths

| Path | Purpose |
| --- | --- |
| `apps/server/src/index.ts` | API entry, active route mounts, `/ws` |
| `apps/server/src/routes/*` | one active route module per domain |
| `apps/server/src/services/market-store.ts` | live upstream + ring buffer |
| `apps/server/src/services/market-data.ts` | freshness-aware history |
| `apps/web/src/App.tsx` | web shell + active routes |
| `apps/web/src/chart/KLineChartSurface.tsx` | Direct klinecharts core wrapper (theme, precision, indicators) |
| `apps/web/src/chart/KLineChartPanel.tsx` | Panel-owned chart, drawing, replay integration |
| `apps/web/src/chart/overlays/*` | custom drawing overlays (channels, fib, shapes, measures, positions) |
| `apps/web/src/chart/ChartToolbar.tsx` | workspace drawing toolbar (grouped flyouts, magnet, bulk actions) |
| `apps/web/src/ui/icons.tsx` | the terminal's hand-drawn icon set |
| `apps/web/src/pages/*` | active product surfaces |
| `apps/web/src/pages/DiscoveryPage.tsx` | news/macro/catalyst/asset discovery |
| `apps/web/src/styles/index.css` | global styles / design tokens |
| `packages/db/src/schema/*` | Drizzle schema |

## Commands

```bash
pnpm dev:infra        # docker infra
pnpm db:migrate       # apply migrations; run pnpm db:generate after schema changes
pnpm dev:restart      # run web + api
pnpm lint && pnpm typecheck && pnpm test
```
