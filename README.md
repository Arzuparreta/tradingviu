# tradingviu

Self-hosted, open-source trading platform. TradingView, but yours.

Multi-tenant, runs on your VPS. Charts, indicators, Pine Script subset, alerts, screening, paper trading, broker integrations, social, portfolios, news, calendars — all the things, in one platform.

**Status:** active development. Slices 1–5 are done, slice 6/7/10/11 are in progress, and slice 9 advanced TA is done except true footprint tape. See `docs/ROADMAP.md`.

## Quick start (self-hosted)

```bash
# 1. Clone
git clone https://github.com/your-org/tradingviu.git
cd tradingviu

# 2. Configure
cp .env.example .env
# edit .env, set DOMAIN, JWT_SECRET, POSTGRES_PASSWORD

# 3. Start
docker compose -f infra/docker-compose.yml --env-file .env up -d

# 4. Migrate DB
pnpm install
pnpm db:migrate
pnpm db:seed

# 5. Open
open https://tradingviu.localhost
```

## Development

```bash
# 1. Install
pnpm install

# 2. Configure
cp .env.example .env
# edit .env

# 3. Start infrastructure (Postgres, Redis, MinIO, Meilisearch, Mailpit)
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres redis minio meilisearch mailpit

# 4. Migrate and seed DB
pnpm db:migrate
pnpm db:seed

# 5. Start dev servers
pnpm dev

# 6. Open
open http://localhost:5187
```

`pnpm dev` boots all packages in watch mode via Turbo. Local development uses
`http://localhost:5187` for the web app and `http://localhost:3101` for the API,
kept away from common Vite/API ports used by other local projects.

> **Firewall note:** If you're accessing the dev server from another device on the same LAN, make sure ports 5187 (web) and 3101 (API) are open:
> ```bash
> sudo ufw allow 5187/tcp
> sudo ufw allow 3101/tcp
> ```

## Architecture

- **Monorepo** (pnpm + Turbo)
- **TypeScript** end-to-end
- **Backend:** Hono on Bun (HTTP + WebSocket same process)
- **DB:** PostgreSQL 16 + TimescaleDB, RLS for multi-tenancy
- **Cache/pubsub:** Redis
- **Auth:** Better Auth (multi-tenant with org plugin)
- **Charts:** `tradingview/lightweight-charts` (Apache 2.0)
- **Data:** native Binance market data (REST klines + WS bars/quote/depth) with CCXT fallbacks and pluggable adapters
- **Frontend:** Vite + React 18
- **Desktop:** Tauri 2
- **Mobile:** React Native

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [AGENTS.md](AGENTS.md) for details.

## License

AGPL-3.0. See [LICENSE](LICENSE).

If you want to run a competing hosted service, you can — but you must also open-source your changes.

## Contributing

Not accepting external contributions yet (early days). Watch the repo.
