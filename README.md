# tradingviu

Personal trading platform for one owner. TradingView-style charting, market data,
alerts, portfolios, paper trading, broker integrations, discovery data, Pine
experiments, and backtesting in one local/self-hosted workspace.

**Current pivot:** this repo is no longer a SaaS product. Billing, plans, quotas,
public API tokens, social/community surfaces, tenants, and RLS have been stripped.
The primary chart route uses KLineChart Pro for the built-in drawing suite.

## Development

```bash
pnpm install
cp .env.example .env
pnpm dev:infra
pnpm db:migrate
pnpm db:seed
pnpm tvctl ensure-owner
pnpm dev:restart
open http://localhost:5187
```

By default `pnpm tvctl ensure-owner` creates or repairs the local owner login from `.env`:
`OWNER_EMAIL=owner@tradingviu.local` and `OWNER_PASSWORD=ChangeMeOwner123!`.
Change those before exposing the app outside your machine.

Local ports are repo-owned:

- Web: `http://localhost:5187`
- API: `http://localhost:3101`
- Dev wrapper: `pnpm dev:status`, `pnpm dev:restart`, `pnpm dev:down`

## Stack

- Monorepo: pnpm workspaces + Turbo
- Frontend: Vite + React 18 + TanStack Query + Zustand
- Main chart: KLineChart Pro / klinecharts
- Legacy chart surfaces still present: lightweight-charts powers `/layout` and
  Pine preview until those surfaces are migrated
- Backend: Hono on Bun, HTTP + WebSocket in one process
- DB: PostgreSQL 16 + TimescaleDB
- Infra: Redis, MinIO, Meilisearch, Mailpit
- Market data: native Binance REST/WS plus adapter packages for other providers

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
```

For browser smoke checks:

```bash
pnpm dev:restart
curl -fsS http://localhost:3101/health
open http://localhost:5187/chart/BTCUSDT
```

See [docs/ROADMAP.md](docs/ROADMAP.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
and [AGENTS.md](AGENTS.md) before making changes.
