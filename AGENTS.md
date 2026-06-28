# AGENTS.md

Conventions for AI agents and humans working on `tradingviu`.

**Before editing, read [`docs/ROADMAP.md`](docs/ROADMAP.md).** It is the current
state map and should beat older slice docs when they conflict.

**If you touch chart drawing tools or chart surfaces, also read
[`docs/CHART_DRAWINGS_REWORK.md`](docs/CHART_DRAWINGS_REWORK.md) and
[`docs/CHART_DRAWINGS_AGENT_BRIEF.md`](docs/CHART_DRAWINGS_AGENT_BRIEF.md).**

## Current Product Direction

- Personal single-owner trading platform, not SaaS.
- No billing, plans, quotas, paid spaces, public token API, tenants, or RLS.
- Request context is user-scoped: `{ userId }`.
- `/chart` uses KLineChart Pro. `/layout` and Pine preview still use the legacy
  lightweight-charts stack until migrated.

## Project Shape

- Monorepo with pnpm workspaces.
- `apps/*` are deployables, `packages/*` are libraries, `services/*` are workers,
  `tools/*` are CLIs.
- TypeScript strict mode end to end. No `any`, no `// @ts-ignore`.
- ESM everywhere. No CommonJS.
- Prefer `import type { Foo } from '...'` for type-only imports.

## Data And API Rules

- Frontend never talks to DB, only to API.
- API edges, DB rows, and external payloads should pass through Zod schemas.
- User-owned reads/writes must scope by `user_id` from request context.
- Global reference data is explicitly global: exchanges, symbols, news,
  calendars, fundamentals, macro data.
- Broker credentials stay encrypted at rest with libsodium (`CRED_ENC_KEY`).

## Code Style

- Async/await over `.then()`.
- Prefer readonly surfaces for exported objects.
- Zod schemas named `FooSchema`, inferred type `Foo`.
- Errors as typed classes in `packages/core/errors.ts`; do not throw raw `Error`
  from application code.

## Dependencies

- Do not add deps without checking workspace packages first (`pnpm ls`).
- Prefer Node-native APIs.
- No Lodash.

## Git And Verification

- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
- Before considering work done, run the focused checks that match the change.
- Full gate: `pnpm lint && pnpm typecheck && pnpm test`.
- Browser work should be smoke-tested with Playwright or a local browser.

## Testing

- Unit tests use Bun.
- Browser E2E uses Playwright.
- Tests must be deterministic. No real network in automated tests; mock external
  providers.

## LLM Notes

- Never invent endpoints, env vars, or table names.
- If a DB schema changes, generate a migration via `pnpm db:generate`.
- Pine Script support is subset v5; check `packages/pine-parser/GRAMMAR.md`
  before adding syntax.
