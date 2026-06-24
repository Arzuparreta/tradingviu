# Self-hosting

## Requirements

- Docker + Docker Compose
- 8 vCPU, 16 GB RAM, 500 GB SSD recommended
- A domain pointed at your VPS

## Steps

```bash
# 1. Clone
git clone https://github.com/your-org/tradingviu.git
cd tradingviu

# 2. Configure
cp .env.example .env
# Required: set JWT_SECRET, CRED_ENC_KEY, POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, MEILI_MASTER_KEY
# Optional: STRIPE_*, ALPACA_*, POLYGON_KEY, FRED_KEY, NEWSAPI_KEY

# 3. Generate strong secrets
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "CRED_ENC_KEY=$(openssl rand -hex 32)" >> .env

# 4. Boot
docker compose -f infra/docker-compose.yml up -d

# 5. Migrate + seed
docker compose -f infra/docker-compose.yml exec api bun run packages/db/src/migrate.ts
docker compose -f infra/docker-compose.yml exec api bun run packages/db/src/seed.ts

# 6. Open
open https://tradingviu.localhost
```

## First sign-up

The first account to sign up becomes the **super admin**. They can:

- Promote/demote users
- Suspend tenants
- Edit plans and quotas
- Add exchanges, import symbols
- View provider health

## Backup

```bash
# DB
docker compose exec postgres pg_dump -U tradingviu tradingviu | gzip > backup-$(date +%F).sql.gz

# MinIO (charts, snapshots)
docker compose exec minio mc mirror /data /backup/minio-$(date +%F)
```

Cron it daily. Restore is reverse.

## Updates

Watchtower is configured. Push a new image → it pulls, restarts, zero downtime.

For self-managed:

```bash
git pull
docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml exec api bun run packages/db/src/migrate.ts
```
