# Slice 1 Historical Note

Slice 1 originally shipped the foundation for a multi-tenant SaaS product. That
architecture is no longer the product direction.

Current foundation:

- Single-owner auth with email/password and JWT.
- User-owned app data scoped by `user_id`.
- PostgreSQL + TimescaleDB for app and market data.
- Hono on Bun for HTTP and WebSocket.
- Vite + React web app.
- KLineChart Pro as the primary chart surface.
- Docker Compose local/self-hosted infrastructure.

Removed from the active model:

- Tenant provisioning and membership.
- RLS policies and runtime app DB role split.
- Super-admin bootstrap.
- Billing, plans, quotas, and Stripe.
- Admin tenant/plan management.

Use `docs/ROADMAP.md` as the current source of truth.
