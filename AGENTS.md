# AGENTS.md

Conventions for anyone — human or agent — working on tradingviu.
Start with [`docs/PRODUCT.md`](docs/PRODUCT.md) for direction and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it fits together.

## Mental model

- Personal single-owner market terminal. One user, their machine, their data.
- Request context is `{ userId }`; user-owned data scopes by `user_id`.
- Anything about tenants, RLS, super-admin, billing, plans, quotas, public `/v1`
  tokens, social/marketplace surfaces, brokers, order placement, paper trading,
  portfolios, options, Pine, backtesting, or papers is dead history. Don't
  rebuild it and don't treat it as a constraint.

## Code

- TypeScript strict, ESM only. No `any`, no `@ts-ignore`, no CommonJS.
- `import type` for type-only imports. Async/await over `.then()`.
- Zod schemas named `FooSchema` with inferred `Foo`; validate API edges, DB rows,
  and external payloads.
- Typed errors from `packages/core/errors.ts`; don't throw raw `Error`.
- Frontend calls the API only. Provider access lives in packages/services.
- Check workspace packages before adding deps (`pnpm ls`). Prefer Node-native. No Lodash.

## Data

- Global reference data (exchanges, symbols, news, calendars, fundamentals,
  macro) is explicitly global. Everything a user creates scopes by `user_id`.
- Schema changes go through a migration (`pnpm db:generate`).
- No active broker-credential surface exists in the product.

## Verify

- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- Run the focused checks for what you touched; full gate is
  `pnpm lint && pnpm typecheck && pnpm test`. Smoke browser work with Playwright.
- Unit tests run on Bun, E2E on Playwright. Tests are deterministic — mock
  external providers, no real network.

## Don't invent

- No made-up endpoints, env vars, or table names — check the code.
- Do not add Pine, strategy/backtest, options, broker, paper-trading, portfolio,
  or papers/documents features unless the product direction is changed first.
