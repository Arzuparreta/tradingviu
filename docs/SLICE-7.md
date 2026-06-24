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

## Remaining Slice 7 Work

- Comments and likes on ideas (7b).
- Follows and a followed-authors feed (7c).
- Scripts marketplace (public/invite-only/protected/paid) and paid Spaces.
