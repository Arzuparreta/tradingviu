# AGENTS.md

Conventions for anyone — human or agent — working on tradingviu.
Start with [`docs/PRODUCT.md`](docs/PRODUCT.md) for direction and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it fits together.

## Mental model

- Personal single-owner trading terminal. One user, their machine, their data.
- Request context is `{ userId }`; user-owned data scopes by `user_id`.
- Anything about tenants, RLS, super-admin, billing, plans, quotas, public `/v1`
  tokens, or social/marketplace surfaces is dead history. Don't rebuild it and
  don't treat it as a constraint.

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
- Broker credentials stay encrypted at rest (libsodium, `CRED_ENC_KEY`).

## Verify

- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- Run the focused checks for what you touched; full gate is
  `pnpm lint && pnpm typecheck && pnpm test`. Smoke browser work with Playwright.
- Unit tests run on Bun, E2E on Playwright. Tests are deterministic — mock
  external providers, no real network.

## Don't invent

- No made-up endpoints, env vars, or table names — check the code.
- Pine support is a v5 subset; see `packages/pine-parser/GRAMMAR.md` before
  extending syntax.
