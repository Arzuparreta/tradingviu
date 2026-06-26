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
  stores *external* provider credentials.
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
- Scopes are stored (default `['read']`) but not yet enforced per-endpoint — the
  current surface is read-only. Per-scope enforcement, rate limiting, write
  endpoints, and a public WebSocket are the next steps.

## Remaining Slice 10 Work

- Per-scope enforcement + rate limiting on `/v1`.
- More `/v1` endpoints (indicators, news, screener) and write operations.
- Public WebSocket streaming API.
- Plugin SDK and Pine v6 compatibility.
