# Slice 4 — Alerts + Portfolios + Paper trading

Commit: `4fd3fd3`

## What it delivered

Three tenant-scoped trading features, each backed by a pure engine (no I/O, fully unit-tested) plus a thin Hono route and a React page. **No DB migration was required** — the foundation schema already contained the tenant-scoped tables.

### Alert engine (`apps/server/src/services/alert-engine.ts`)

A pure condition evaluator covering three condition shapes:

- **price** — `above` / `below` / `crosses_above` / `crosses_below` / `equals`
- **indicator** — evaluates a `@tv/ta-lib` indicator line against an operator/value
- **multi** — `all` / `any` composition of nested conditions (recursive, max depth via `AlertConditionSchema`)

Schemas live in `packages/core/src/trading-schemas.ts` (`AlertConditionSchema` is a `z.lazy` discriminated union so `multi` can nest).

Routes (`apps/server/src/routes/alerts.ts`):

- `GET /api/alerts` — list
- `POST /api/alerts` — create
- `PATCH /api/alerts/:id` — update (e.g. toggle `active`)
- `DELETE /api/alerts/:id`
- `POST /api/alerts/:id/evaluate` — evaluate against a supplied price/previousPrice (manual trigger)
- `GET /api/alerts/:id/history` — fired history

Channels: `in_app` is delivered now; `email` / `webhook` are recorded for future background workers (see `services/notifier`).

### Portfolio engine (`apps/server/src/services/portfolio-engine.ts`)

Pure holdings + P&L rebuild from a transaction log:

- Average-cost holdings, realized P&L on sells, dividends and fees tracked
- `computeHoldings(transactions)` returns `{ holdings, metrics }`
- `toDecimalText` helper keeps numeric values as Postgres `numeric` text to avoid float drift

Routes (`apps/server/src/routes/portfolios.ts`): portfolios CRUD, `POST /:id/transactions`, and a detail endpoint returning holdings + transactions + metrics.

### Paper trading (`apps/server/src/services/paper-trading.ts`)

Pure fill model: market and limit orders with instant/pending fills, slippage (bps), fees (bps), and a buying-power check (balance × leverage).

Routes (`apps/server/src/routes/paper.ts`): paper accounts CRUD, account detail with orders, and `POST /:id/orders` which fills via the engine and updates the cash balance on filled orders.

## Web

- `apps/web/src/pages/AlertsPage.tsx`
- `apps/web/src/pages/PortfoliosPage.tsx`
- `apps/web/src/pages/PaperTradingPage.tsx`

All wired into `App.tsx` nav and `apps/web/src/api/client.ts` / `types.ts`.

## Tests

`apps/server/src/services/slice4.test.ts` — price-cross evaluation, holdings/realized-P&L rebuild, market fill with fee + slippage.

## 4f — Portfolio analytics (later addition)

Status: done.

- `packages/portfolio-analytics`: a pure, deterministic engine over priced
  positions (`{ symbolId, ticker, quantity, avgCost, price, assetClass?,
  sector? }`). It computes total market value / cost basis / unrealized P&L
  (abs + %), per-position weight and signed P&L contribution, allocation by
  asset class and sector, concentration (HHI, top / top-3 weight, effective
  number of holdings = 1/HHI), and the best/worst position by return.
- `GET /api/portfolios/:id/analytics` rebuilds the holdings, fetches a current
  price per holding (latest daily close via the provider, falling back to avg
  cost on error), enriches with `assetClass`/`sector`, and runs the engine.
- `PortfoliosPage` gains an **Analytics** card: headline totals + concentration,
  an allocation-by-asset-class bar chart, best/worst, and a positions table
  (weight, value, return, P&L).
- `packages/portfolio-analytics/src/index.test.ts` — hand-computed totals,
  weights, P&L contribution, allocations, HHI/effective holdings, best/worst,
  the empty case, and determinism.
- No DB migration: prices come from the existing provider path; metadata from
  the `symbols` table.

## 4g — Alert webhook delivery (later addition)

Status: done.

- Completes the alert channel loop the original slice left "for future workers":
  a fired alert now **delivers an outbound webhook** (the `in_app` channel was
  already delivered; `email` remains deferred).
- `packages/notifications`: a small, mostly-pure package — `buildAlertWebhookPayload`
  (the `alert.fired` JSON), `renderAlertTitle`, an **SSRF guard**
  `isPublicWebhookUrl` (rejects non-http(s), loopback, private, link-local /
  cloud-metadata, and IPv6 ULA/link-local hosts), and `deliverWebhook(url,
  payload, fetchImpl)` which refuses unsafe URLs and never throws (a failed POST
  is recorded as pending). The fetch is injected so it is unit-tested with a
  fake — no network.
- Migration `0008` adds a nullable `alerts.webhook_url`. `CreateAlert` /
  `UpdateAlert` accept `webhookUrl` (Zod-validated URL); the alerts route stores
  it, and `POST /api/alerts/:id/evaluate` POSTs the payload (native `fetch`) when
  the alert fires with the `webhook` channel + a URL, writing the result into the
  history row's `delivered.webhook`.
- `AlertsPage` gains an optional **Webhook URL** field (adds the `webhook`
  channel) and a 🔗 indicator on alerts that have one.
- `packages/notifications/src/index.test.ts` covers the payload, the title, the
  SSRF guard (loopback / private / metadata / non-http), and that `deliverWebhook`
  succeeds on 2xx, fails on non-2xx, never throws, and refuses unsafe URLs
  without calling fetch.

Notes:

- The SSRF guard is hostname-level (no DNS resolution), so it can't stop DNS
  rebinding — a network egress policy is the real defense; the guard blocks the
  obvious cases.
- Email delivery (SMTP → Mailpit) is the natural follow-up; the notifications
  package is structured to host it.

## 4h — Alert email delivery (later addition)

Status: done.

- Adds the `email` channel: a fired alert emails the alert owner (recipient =
  the JWT `email` claim).
- `packages/notifications` grows pure helpers — `renderAlertEmail` (subject +
  text body) and `buildRfc822` (CRLF normalization + dot-stuffing of lines that
  begin with `.`) — plus an injectable `EmailTransport` and `deliverEmail` that
  never throws. All unit-tested with a fake transport (no network).
- `apps/server/src/services/email.ts`: a tiny **native SMTP client over
  `node:net`** (no new dependency) — EHLO → MAIL/RCPT → DATA → QUIT — enough to
  relay through an unauthenticated dev relay like **Mailpit** (already in
  `infra/docker-compose.yml`). `getEmailTransport()` returns the transport when
  `SMTP_HOST` is set, else null (email simply isn't delivered).
- `POST /api/alerts/:id/evaluate` now delivers email when the alert has the
  `email` channel, recording the result in `delivered.email`. `AlertsPage` gains
  an "Email me when it fires" checkbox and a ✉ indicator; new `SMTP_HOST` /
  `SMTP_PORT` env (defaulting to Mailpit's `localhost:1025`).

Notes:

- The SMTP client targets a trusted local/self-host relay: no AUTH and no
  STARTTLS. An authenticated/TLS relay would need those added (or swap in a
  library transport behind the same `EmailTransport` interface).
- With 4g (webhook) + 4h (email), all three alert channels — in-app, webhook,
  email — now deliver.
