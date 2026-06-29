# tradingviu

A personal, self-hosted market terminal — a TradingView-style workspace you own.
The active product is charts, live market data, watchlists, layouts, alerts,
news, calendars, macro, fundamentals, and clean asset discovery for one owner.

It is not a brokerage, portfolio tracker, paper-trading sandbox, options lab,
Pine editor, backtesting product, papers/documents system, or SaaS surface.

See [`docs/PRODUCT.md`](docs/PRODUCT.md) for direction and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it fits together.

## Run it

```bash
pnpm install
cp .env.example .env
pnpm dev:infra            # Postgres, Redis, MinIO, Meilisearch, Mailpit (Docker)
pnpm db:migrate
pnpm db:seed
pnpm tvctl ensure-owner   # creates/repairs the owner login from .env
pnpm dev:restart
open http://localhost:5187
```

The owner login defaults to `OWNER_EMAIL` / `OWNER_PASSWORD` in `.env`
(`owner@tradingviu.local` / `ChangeMeOwner123!`). Change them before exposing the
app beyond your machine.

Ports (repo-owned): web `5187`, API `3101`. Dev wrapper: `pnpm dev:status`,
`pnpm dev:restart`, `pnpm dev:down`.

## Stack

- Monorepo: pnpm workspaces + Turbo
- Web: Vite + React 18 + TanStack Query + Zustand
- Chart: KLineChart Pro
- API: Hono on Bun (HTTP + WebSocket in one process)
- Data: PostgreSQL 16 + TimescaleDB; Redis, MinIO, Meilisearch, Mailpit
- Market data: native Binance REST/WS plus provider adapter packages
- Discovery data: provider-backed news, calendars, fundamentals, and macro ingest

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm e2e
```
