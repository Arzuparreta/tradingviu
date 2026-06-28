# Self-hosting

This project is currently designed for personal use by one owner.

## Requirements

- Docker + Docker Compose
- Node 22+, Bun 1.3+, pnpm 10+
- A domain if exposing it outside your LAN

## Setup

```bash
git clone https://github.com/your-org/tradingviu.git
cd tradingviu
cp .env.example .env

# Edit .env:
# - JWT_SECRET
# - POSTGRES_PASSWORD
# - CRED_ENC_KEY
# - MINIO_ROOT_PASSWORD
# - MEILI_MASTER_KEY
# - OWNER_EMAIL and OWNER_PASSWORD

pnpm install
pnpm dev:infra
pnpm db:migrate
pnpm db:seed
pnpm tvctl ensure-owner
pnpm dev:restart
```

Open `http://localhost:5187`.

## Backups

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec postgres \
  pg_dump -U tradingviu tradingviu | gzip > backup-$(date +%F).sql.gz
```

Restore is the reverse: stop the app, restore Postgres, then restart the app.
