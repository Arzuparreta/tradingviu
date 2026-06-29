# tradingviu

A personal, self-hosted market terminal — a TradingView you own. Charting, live
market data, watchlists, alerts, portfolios, paper trading, broker connections,
options, backtesting, and market research in one local workspace, for a single
owner.

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
- Chart: KLineChart Pro (legacy lightweight-charts still powers `/layout` + Pine preview)
- API: Hono on Bun (HTTP + WebSocket in one process)
- Data: PostgreSQL 16 + TimescaleDB; Redis, MinIO, Meilisearch, Mailpit
- Market data: native Binance REST/WS plus provider adapter packages

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm e2e
```
