# tradingviu

Self-hosted, open-source trading platform. TradingView, but yours.

Multi-tenant, runs on your VPS. Charts, indicators, Pine Script subset, alerts, screening, paper trading, broker integrations, social, portfolios, news, calendars — all the things, in one platform.

**Status:** active development. Slice 1 / Phase 0.

## Quick start (self-hosted)

```bash
# 1. Clone
git clone https://github.com/your-org/tradingviu.git
cd tradingviu

# 2. Configure
cp .env.example .env
# edit .env, set DOMAIN, JWT_SECRET, POSTGRES_PASSWORD

# 3. Start
docker compose -f infra/docker-compose.yml up -d

# 4. Migrate DB
pnpm install
pnpm db:migrate
pnpm db:seed

# 5. Open
open https://tradingviu.localhost
```

## Development

```bash
pnpm install
pnpm dev
```

`pnpm dev` boots all packages in watch mode via Turbo.

## Architecture

- **Monorepo** (pnpm + Turbo)
- **TypeScript** end-to-end
- **Backend:** Hono on Bun (HTTP + WebSocket same process)
- **DB:** PostgreSQL 16 + TimescaleDB, RLS for multi-tenancy
- **Cache/pubsub:** Redis
- **Auth:** Better Auth (multi-tenant with org plugin)
- **Charts:** `tradingview/lightweight-charts` (Apache 2.0)
- **Data:** CCXT for crypto, pluggable adapters
- **Frontend:** Vite + React 18
- **Desktop:** Tauri 2
- **Mobile:** React Native

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [AGENTS.md](AGENTS.md) for details.

## License

AGPL-3.0. See [LICENSE](LICENSE).

If you want to run a competing hosted service, you can — but you must also open-source your changes.

## Contributing

Not accepting external contributions yet (early days). Watch the repo.
