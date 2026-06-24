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

## 7c — Follows + Followed-Authors Feed

Status: done.

Delivered:

- Tenant-scoped `/api/follows` routes over the existing `follows` table:
  `GET /follows/following` (authors the caller follows), `GET /follows/followers`
  (members who follow the caller), `GET /follows/suggestions` (tenant members the
  caller does not follow yet, self excluded, ordered by public-idea count),
  `POST /follows/:userId` (idempotent follow), and `DELETE /follows/:userId`
  (idempotent unfollow).
- Follow targets are validated as members of the caller's tenant: following a
  non-member (or a user in another tenant) returns 404, and following yourself
  returns a 422 validation error. The `follows_pair_uq` unique index plus an
  existence check keep follows idempotent.
- The idea feed/detail now returns `author.following` (per-caller boolean) via a
  left join on `follows`, so the UI can render a Follow/Unfollow control on each
  card.
- Followed-authors feed: `GET /api/ideas?author=following` filters the feed to
  ideas authored by users the caller follows (subquery on `follows`), reusing the
  existing public/own-private visibility rules.
- Web `IdeasPage`: a third **Following** feed tab, a Follow/Unfollow button on
  every non-own idea card, and a left-column **People** panel listing who you
  follow plus suggested authors (each with their public-idea count and a follow
  toggle).

Notes:

- No DB migration was required — the `follows` table and its RLS tenant-isolation
  policy already shipped with the foundation schema (migration `0000`) and were
  already in the RLS table set.
- `author=following` is a reserved feed selector; user ids are ULIDs, so they can
  never collide with the literal `following` (same pattern as the existing `me`).
- Followed-authors only surfaces ideas inside the caller's tenant, so the feed
  respects tenant isolation even when an author is followed.

## 7d — Scripts Marketplace

Status: done.

Delivered:

- Tenant-scoped `/api/scripts` routes over the existing `published_scripts` table:
  marketplace feed (`GET /scripts`), detail (`GET /scripts/:id`), publish
  (`POST /scripts`), owner update (`PATCH /scripts/:id`), owner delete
  (`DELETE /scripts/:id`), install (`POST /scripts/:id/install`), and favorite /
  unfavorite (`POST`/`DELETE /scripts/:id/favorite`).
- Visibility model on the existing `visibility` column:
  - `public` — open-source, listed, source readable by anyone in the tenant.
  - `protected` — closed-source, listed + installable, source hidden from
    non-authors (returned as `null` with `locked: true`).
  - `private` — only the author can see, open, or install it (404 for others).
- Source-access rule (`canReadSource`): the author always reads their own source;
  everyone else reads source only for `public` scripts. Detail and install both
  honor it, so protected/paid source never leaks.
- Marketplace feed lists `public` + `protected` (and the caller's own `private`),
  never includes `source`, and supports `q` (name/description), `author`
  (`me`/user id), `visibility`, `free` (price = 0), and `sort` (`recent` |
  `popular` by downloads).
- Install counts a download (`downloads++`) and returns the source only when
  readable — closed-source scripts still install (added to library) but keep their
  source hidden.
- Favorites reuse the target-based `likes` table with `target_type = 'script'`
  (idempotent via the existing `likes_user_target_uq` index); the feed/detail
  surface `favoritesCount` (correlated subquery) and a per-caller `favorited`
  flag.
- `priceCents` carries a price for paid scripts (default free); actual purchase /
  payment is deferred to paid Spaces.
- Zod schemas in `packages/core/src/social-schemas.ts` (`PublishScript`,
  `UpdateScript`, `ScriptsQuery`, visibility/sort enums) with unit tests.
- Web `ScriptsPage` at `/scripts` (linked from the top nav): publish form
  (name, description, source, visibility, price) and a marketplace with
  All/Mine/Free filters, Newest/Popular sort, per-card favorite toggle, install
  (reveals source inline when unlocked, otherwise an "installed, closed-source"
  note), and owner-only delete.

Notes:

- No DB migration was required — `published_scripts` and `likes` both already
  shipped with the foundation schema and are in the RLS tenant-isolation set.
- `author=me` is a reserved selector (ULIDs never collide with `me`), matching the
  ideas feed.

## 7e — Paid Spaces (subscription channels)

Status: done.

Delivered:

- Three new tenant-scoped tables (migration `0006`): `spaces` (creator-owned
  channel: name, description, visibility, `price_cents`, `currency`, denormalized
  `subscribers_count`), `space_subscriptions` (the entitlement ledger, unique per
  `(space_id, user_id)` with `active`/`canceled` status), and `space_posts` (gated
  content). All three are in the RLS tenant-isolation set.
- Tenant-scoped `/api/spaces` routes: feed (`GET /spaces`), detail
  (`GET /spaces/:id`), create/update/delete (owner-enforced), subscribe /
  unsubscribe (`POST`/`DELETE /spaces/:id/subscribe`), gated posts list
  (`GET /spaces/:id/posts`), and owner post create/delete
  (`POST`/`DELETE /spaces/:id/posts[/:postId]`).
- Visibility: `public` spaces are listed in the tenant feed; `private` spaces are
  unlisted and reachable (and subscribable) only by direct id — the invite-link
  model. Detail returns 404 for a private space unless the caller owns it or has
  an active subscription.
- Entitlement model: a space's posts are readable only by the owner or an active
  subscriber (else 403). The `space_subscriptions` ledger is the single source of
  truth; `subscribers_count` is a denormalized counter maintained transactionally
  and only on active-state transitions (subscribe / reactivate / cancel), so
  re-subscribing reuses the row and never double-counts.
- Subscribe is idempotent and reactivates a canceled subscription. For paid
  spaces it records the price and grants the entitlement directly — with billing
  disabled there is no payment gateway in front of it yet (see remaining work).
  Owners get a 422 if they try to subscribe to their own space.
- Feed filters: `q` (name/description), `owner` (`me`/user id), `free`
  (price = 0), `subscribed` (only active subscriptions), and `sort`
  (`recent` | `popular` by subscriber count).
- Zod schemas in `packages/core/src/social-schemas.ts` (`CreateSpace`,
  `UpdateSpace`, `SpacesQuery`, `CreateSpacePost`, visibility/sort enums) with
  unit tests.
- Web `SpacesPage` at `/spaces` (linked from the top nav): create form
  (name, description, visibility, price), a Discover/Mine/Subscribed +
  Newest/Popular browse, per-card Subscribe/Unsubscribe (price shown for paid),
  and an expandable space view that loads gated posts (locked notice when not
  entitled) with an owner-only composer and post delete.

Notes:

- `space_subscriptions` is distinct from the billing `subscriptions` table — the
  former is per-space entitlements, the latter is the tenant's Stripe plan.
- Run migrate + seed (or re-apply RLS) after pulling: `0006` adds the three tables
  and their RLS policies are applied by `applyRls` (the `pnpm db:seed` path).

## Remaining Slice 7 Work

- Stripe-backed checkout in front of paid-space subscriptions (and a refund /
  expiry lifecycle) instead of granting the entitlement directly.
- A real purchase/entitlement flow for paid scripts (7d), likely sharing the same
  entitlement machinery as Spaces.
