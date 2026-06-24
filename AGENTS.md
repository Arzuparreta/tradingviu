# AGENTS.md

Conventions for AI agents and humans working on `tradingviu`. Read this before editing anything.

## Project shape

- **Monorepo.** pnpm workspaces. `apps/*` are deployable; `packages/*` are libraries; `services/*` are background workers; `tools/*` are CLIs.
- **TypeScript end-to-end.** Strict mode. No `any`. No `// @ts-ignore`. Prefer `unknown` + narrowing.
- **No untyped boundaries.** Every API edge, DB row, and external payload passes through a Zod schema. Define schemas in `packages/core` and import everywhere.

## Multi-tenant rules (non-negotiable)

1. **Every data table has `tenant_id`** except global reference data (`exchanges`, `symbols`, `news_articles`, `economic_events`, `plans`).
2. **RLS is enforced at the DB level.** Application code never queries cross-tenant.
3. **Every request resolves `tenant_id` from the JWT** and stores it in `AsyncLocalStorage`. Workers receive it per-job.
4. **Drizzle inserts auto-inject `tenant_id`.** Reads filter by it. No exceptions.
5. **E2E tests verify isolation.** Two seeded tenants must never see each other's data.

## Code style

- ESM everywhere. No CommonJS.
- `import type { Foo } from '...'` for type-only imports.
- Async/await over `.then()`.
- Prefer `readonly` on objects exposed from libraries.
- Zod schemas named `FooSchema`, inferred type `Foo`.
- Errors as typed classes in `packages/core/errors.ts`. Never throw `Error` directly.

## Boundaries

- Frontend never talks to DB. Only to API.
- API never talks to external services directly. Goes through `packages/data-adapters`.
- Workers are independent processes, communicate via Redis Streams or NATS, never share memory with API.
- Broker credentials encrypted at rest with libsodium (key from env).

## File layout conventions

```
src/
  index.ts          # entrypoint, exports only public API
  internal/         # private helpers
  schema.ts         # Zod schemas
  types.ts          # inferred types, re-exports
  errors.ts         # typed error classes
  *.test.ts         # co-located tests
```

## Naming

- `kebab-case` for files and dirs.
- `PascalCase` for types/classes/components.
- `camelCase` for functions, vars, hooks.
- `SCREAMING_SNAKE` for env vars and constants.
- DB columns: `snake_case`. TypeScript fields: `camelCase` mapped via Drizzle.

## Dependencies

- **No adding deps without checking if it's already in the workspace.** `pnpm ls` first.
- Prefer Node-native APIs (fetch, streams, WebSocket).
- Avoid heavy ORMs. Drizzle for SQL, Kysely for type-safe query building.
- No Lodash. Use native methods or `es-toolkit` if absolutely needed.

## Git

- Branch per slice. Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
- PRs must pass: `pnpm lint && pnpm typecheck && pnpm test`.
- No force-push to main.

## Testing

- Unit tests with `bun test` (Bun native, fast).
- E2E with `playwright` (browser) + `bun test` (API).
- Tests must be deterministic. No real network. Mock CCXT, Stripe, etc.

## LLM/AI notes

- When generating code, follow this doc strictly.
- Never invent endpoints, env vars, or table names — they must exist in the schema.
- If a task is ambiguous, ask. Don't guess.
- If a change touches DB schema, generate a migration via `pnpm db:generate`.
- Pine Script: subset v5 only. Check `packages/pine-parser/GRAMMAR.md` before adding syntax.
