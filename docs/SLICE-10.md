# Slice 10 — Ecosystem (Public API)

Slice 10 opens the platform up: a versioned public REST API authenticated with
personal access tokens, described by an OpenAPI document.

## 10a — Personal access tokens + public `/v1` + OpenAPI

Status: done.

Delivered:

- **API key primitives** (`@tv/auth/api-keys`): `generateApiKey` (format
  `tvk_<prefix>_<secret>`), `hashApiKey` (SHA-256 — keys are high-entropy, so a
  fast hash, not a password KDF), `parseApiKeyPrefix`, and a constant-time
  `verifyApiKey`. Only the **hash + lookup prefix** are stored; the full key is
  shown once at creation. Unit-tested.
- **`access_tokens` table** (migration `0009`, tenant + user scoped, RLS-enabled
  via `rls-policies`): `name`, unique `prefix`, `hash`, `scopes`, `lastUsedAt`,
  `expiresAt`, `revokedAt`. Distinct from the existing `api_keys` table, which
  stores _external_ provider credentials.
- **Management API** (`/api/access-tokens`, under the normal JWT/tenant auth):
  list (never returns the hash), create (returns the full key exactly once), and
  soft-revoke.
- **`apiKeyContext` middleware**: authenticates a public request via
  `Authorization: Bearer tvk_…` or `X-API-Key`. It mirrors `tenantContext` —
  resolve the token → tenant under a short super-admin transaction (RLS can't
  help before the tenant is known), verify the hash, reject revoked/expired
  tokens, bump `lastUsedAt`, then run the handler inside a tenant-scoped RLS
  transaction. Tokens never carry super-admin.
- **Public `/v1` surface** (mounted outside the `/api/*` JWT middleware):
  `GET /v1/symbols` (search + limit) and `GET /v1/symbols/:id/history`
  (interval + limit), reusing the existing provider path. `GET /openapi.json`
  serves an OpenAPI 3.1 document (unauthenticated) describing the endpoints and
  the bearer/apiKey security schemes.
- **Web**: an **API keys** page (`/api-keys`, in the nav) to create (with a
  one-time key reveal + copy), list, and revoke tokens, plus a ready-to-run
  `curl` example and a link to the spec.

Notes:

- `/v1/*` is deliberately mounted at the top level (not `/api/*`) so the
  JWT-based `tenantContext` doesn't intercept token-authenticated requests.
- Scopes started as stored metadata in 10a and are enforced in later sub-slices.

## 10b — Rate limiting + scope enforcement

Status: done.

Delivered:

- **Scope enforcement:** `apiKeyContext` now exposes the token's `prefix` and
  `scopes` on the context, and a `requireScope(scope)` middleware returns
  `403 insufficient_scope` when the token lacks it. The `/v1` surface requires
  the `read` scope (tokens default to `['read']`).
- **Per-token rate limiting:** `apps/server/src/services/rate-limit.ts` — a pure
  fixed-window core (`rateWindowKey`, `evaluateRateLimit`) plus a `rateLimit`
  middleware that counts requests in Redis (`INCR` + `EXPIRE`), sets
  `X-RateLimit-Limit/Remaining/Reset` headers, and returns `429` with
  `Retry-After` once the limit is exceeded. It **fails open** — if Redis is
  unavailable the request is allowed, so a limiter outage never takes the API
  down. Configured by `API_RATE_LIMIT` (default 120) / `API_RATE_WINDOW_SEC`
  (default 60).
- Mounted on `/v1/*` (after `apiKeyContext`, so the limiter keys by token
  prefix); the OpenAPI description documents the scope requirement, the
  `X-RateLimit-*` headers, and the `429`.
- The pure window math is unit-tested (`services/rate-limit.test.ts`): window key
  stability/rotation, allow-up-to-limit-then-block, remaining + reset reporting.

## 10c — Expanded public reads + watchlist writes

Status: done.

Delivered:

- Expanded the public `/v1` read surface beyond symbols/history:
  `GET /v1/indicators`, `POST /v1/indicators/compute`,
  `GET /v1/screener/metrics`, `POST /v1/screener`, and `GET /v1/news`.
- Added the first public write surface, guarded by a `write` scope:
  `GET/POST/DELETE /v1/watchlists`, `GET/POST /v1/watchlists/:id/items`, and
  `PATCH/DELETE /v1/watchlists/:id/items/:itemId`.
- Personal tokens now validate against explicit scopes (`read`, `write`) and
  must include `read`; `write` extends a token for mutations instead of replacing
  the base read permission.
- Public watchlists are scoped to the token's user, not just the tenant, so a
  personal access token cannot enumerate or mutate another tenant member's
  watchlists.
- The API keys page can create read-only or read/write tokens and includes a
  write example; OpenAPI documents the new endpoints and write-scope
  requirements.

Notes:

- No migration was required. The watchlist tables already existed and remain
  tenant-scoped under RLS; the `/v1` layer adds user ownership checks on top.

## Remaining Slice 10 Work

- Public WebSocket streaming API.
- Plugin SDK and Pine v6 compatibility.
