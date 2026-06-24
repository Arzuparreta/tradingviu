# Slice 7 — Social

Slice 7 is the social layer: trade ideas, comments, likes, follows, and the scripts
marketplace. It builds on the tenant-scoped `ideas`, `comments`, `follows`, and
`published_scripts` tables that already exist in the schema.

## 7a — Ideas CRUD + Feed

Status: done.

Delivered:

- Tenant-scoped `/api/ideas` routes: feed (`GET /ideas`), detail (`GET /ideas/:id`),
  create (`POST /ideas`), update (`PATCH /ideas/:id`), and delete (`DELETE /ideas/:id`).
- Feed visibility: members see all `public` ideas in their tenant plus their own
  `private` ideas; private ideas are hidden from non-authors on detail too.
- Filters: `symbol` (id/ticker/name), `author` (`me` or a user id), `direction`, and
  `visibility`, ordered newest-first with a `limit`.
- Each idea joins its author (`users`) and optional symbol (`symbols` + `exchanges`,
  left-joined so symbol-less ideas still render).
- Ownership enforced on mutate: update/delete require the idea to belong to the caller
  (404 if missing, 403 if not the owner), on top of RLS tenant isolation.
- Zod schemas in `packages/core/src/social-schemas.ts` (`CreateIdea`, `UpdateIdea`,
  `IdeasQuery`, direction/visibility enums) with unit tests.
- Web `IdeasPage` at `/ideas` (linked from the top nav): publish form (title, thesis,
  symbol, direction, public/private) and a feed with an All/Mine toggle and owner-only
  delete.

Notes:

- No DB migration was required — the `ideas` table and its RLS policy already shipped
  with the foundation schema.
- `likesCount`/`commentsCount` are surfaced read-only; likes and comments are wired in
  later sub-slices (7b/7c).

## 7b — Comments + Likes on Ideas

Status: done.

Delivered:

- New global-per-tenant `likes` table (target-based: `target_type`/`target_id`) with a
  `likes_user_target_uq` unique index that makes liking idempotent and prevents
  double-likes; added to the RLS tenant-isolation set (migration `0005`).
- Comments on ideas over the existing generic `comments` table:
  `GET /ideas/:id/comments`, `POST /ideas/:id/comments` (optional `parentId` for
  threads), and `DELETE /ideas/:id/comments/:commentId` (owner-only).
- Likes on ideas: `POST /ideas/:id/like` (idempotent) and `DELETE /ideas/:id/like`.
- Denormalized counters maintained transactionally: `ideas.commentsCount` and
  `ideas.likesCount` increment/decrement (floored at 0) alongside the row change, all
  inside the request's RLS transaction.
- The idea feed/detail now returns a per-caller `liked` boolean via a left join on
  `likes`.
- Commenting and liking require the idea to be visible to the caller (public in-tenant
  or own private), so cross-tenant and private ideas return 404.
- `CreateComment` Zod schema in `packages/core/src/social-schemas.ts`.
- Web `IdeasPage`: each idea card has a like toggle (count + state) and an expandable
  comments thread with inline add and owner-only delete.

Notes:

- `likes` is a new table, so its RLS policy is applied by `applyRls` during `pnpm db:seed`
  (the same path as every other tenant-scoped table); run migrate + seed after pulling.
- Counts are denormalized for cheap feed reads; the like/comment endpoints are the only
  writers and keep them in sync within the transaction.

## Remaining Slice 7 Work

- Follows and a followed-authors feed (7c).
- Scripts marketplace (public/invite-only/protected/paid) and paid Spaces.
