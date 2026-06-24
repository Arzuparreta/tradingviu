# Slice 1 — what you can run right now

This is the first vertical slice. Everything below is end-to-end working on a fresh VPS.

## What works

- Multi-tenant DB with PostgreSQL RLS (every request scopes `app.tenant_id`)
- Public sign-up; first user = super admin, everyone else gets a personal tenant
- Argon2id passwords, HS256 JWT in httpOnly cookies (7d)
- Plan system: Free, Essential, Plus, Premium, Ultimate seeded
- Stripe scaffold (checkout, portal, webhook) — disabled until `STRIPE_SECRET_KEY` is set
- Symbol catalog seeded with 8 exchanges and 11 popular crypto pairs
- CCXT data adapter: Binance, Coinbase, Kraken, Bybit (historical + WebSocket)
- Chart history endpoint pulling OHLCV from the right exchange per symbol
- Web app: signup, login, dashboard, chart (candles on `lightweight-charts`), admin
- `tvctl` operator CLI: tenants, users, plans, exchanges, symbols
- Docker Compose: Postgres+TimescaleDB, Redis, MinIO, Meili, Mailpit, Caddy, api, web

## What doesn't work yet (slice 2+)

- Real-time bar updates over WebSocket (history polling for now)
- Indicators on chart (TA-Lib integration pending)
- Drawing tools
- Watchlists / portfolios / alerts CRUD
- Screener
- Symbol search via Meili
- Pine Script parser
- Paper trading UI
- Broker integrations

## Quick start

```bash
# Boot everything
docker compose -f infra/docker-compose.yml up -d postgres redis

# Install deps (host)
pnpm install

# Migrate + seed
pnpm db:migrate
pnpm db:seed

# Dev
pnpm dev
# → web on http://localhost:5173
# → api on http://localhost:3001
```

Or fully containerized:

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml exec api bun run packages/db/src/migrate.ts
docker compose -f infra/docker-compose.yml exec api bun run packages/db/src/seed.ts
```

## Try it

1. Open `http://localhost:5173`
2. Sign up (first signup is super admin)
3. Click "Open chart"
4. Pick a symbol, e.g. `BINANCE:BTCUSDT`
5. You should see candles rendering with live-ish data from Binance
