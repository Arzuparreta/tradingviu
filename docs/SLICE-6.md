# Slice 6 — Discovery, Calendars, Screener

Slice 6 is the market discovery layer: news, earnings/economic/dividend calendars, yield curves, fundamentals, and screener.

## 6a — News + Calendars Read Surface

Status: done.

Delivered:

- `GET /api/news` with filters for symbol, source, sentiment, text query, date range, and limit.
- `GET /api/calendars/earnings` with symbol/date filters and symbol/exchange joins.
- `GET /api/calendars/economic` with country, importance, date range, and limit filters.
- Zod query schemas in `packages/core/src/discovery-schemas.ts`.
- `DiscoveryPage` in the web app at `/discovery`, linked from the authenticated top navigation.
- Seeded demo news, earnings, and economic calendar rows for clean local installs.

Notes:

- This slice uses the existing global tables: `news_articles`, `earnings_calendar`, and `economic_events`.
- No DB migration was required.
- External provider ingestion is intentionally not part of 6a. The next cut should add deterministic adapter interfaces and mocked tests before wiring real providers.

## 6b — Screener Engine + Saved Presets

Status: done.

Delivered:

- `packages/screener-engine` with SQL filter builders, stable metric catalog, sort helpers, and metadata metric extraction.
- `GET /api/screener` over global `symbols` joined to `exchanges`, with filters for text, asset class, exchange, country, sector, active state, and metric min/max ranges.
- Tenant-scoped `/api/screener/presets` CRUD over the existing `screener_presets` table.
- Zod schemas for screener queries and preset payloads in `packages/core/src/discovery-schemas.ts`.
- `/discovery` web screener panel with compact filters, result table, save preset, load preset, and delete preset actions.
- Seeded demo symbol metrics in `symbols.metadata` for AAPL/MSFT so clean installs show screener results without network access.

Notes:

- No DB migration was required. This cut intentionally reads fundamentals-like metrics from `symbols.metadata` until Slice 6 adds a dedicated fundamentals time-series table.
- Presets are tenant-scoped and filtered by RLS like other tenant data.

## 6c — Dividend Calendar

Status: done.

Delivered:

- Global `dividend_calendar` table with symbol linkage, ex-date, record/payment/declaration dates, amount, currency, and frequency.
- RLS policies matching the other global discovery tables: public read, super-admin write.
- `GET /api/calendars/dividends` with symbol/date filters and symbol/exchange joins.
- Zod query schema in `packages/core/src/discovery-schemas.ts`.
- `/discovery` dividend calendar panel using the existing symbol/date filters.
- Seeded demo dividend rows for AAPL/MSFT.

## 6d — News Provider Adapters + Scheduled Ingestion

Status: done.

Delivered:

- `packages/news` with a provider interface, Zod-backed article normalization, deterministic `MockNewsProvider`, provider registry, and unit tests.
- `services/news-ingest` background service that fetches normalized articles and upserts into global `news_articles` by URL.
- Ingestion runs through `DATABASE_URL_ADMIN` with super-admin RLS context inside a transaction, preserving the runtime `tv_app`/RLS boundary.
- Root `pnpm news:ingest` command for a one-shot local ingest; `pnpm --filter @tv/news-ingest start` runs the same worker on an interval.
- Env controls for provider, symbol/date filters, limit, and interval in `.env.example`.

Notes:

- The only provider implemented in this cut is `mock`; real NewsAPI/Finnhub/Benzinga adapters should plug into the same interface with mocked tests first.
- No DB migration was required because 6a already added the `news_articles` read surface and table.

## 6e — Fundamentals Storage + API

Status: done.

Delivered:

- Global `fundamental_snapshots` table for symbol fundamentals, including TTM/latest flags and screener metrics.
- RLS policies matching other global discovery tables: public read, super-admin write.
- Zod-validated `GET /api/fundamentals` endpoint with symbol, period, latest-only, and limit filters.
- Screener metric filters and sorting now read from dedicated fundamentals storage instead of `symbols.metadata`.
- `/discovery` fundamentals panel showing latest market cap, revenue, valuation, growth, ROE, and 52-week range.
- Seeded AAPL/MSFT demo fundamentals for clean installs.

Notes:

- `symbols.metadata` still contains demo values for compatibility, but screener metrics now use `fundamental_snapshots`.
- Real provider ingestion is not part of this cut; future adapters should write snapshots with super-admin RLS context.

## 6f — Yield Curves + Macro Series

Status: done.

Delivered:

- Global `yield_curves` table for country/date/tenor rate points.
- Global `macro_series_observations` table for country/metric/date macro observations.
- RLS policies matching other global discovery tables: public read, super-admin write.
- Zod-validated `GET /api/macro/yield-curves` endpoint with country, source, date range, latest-only, and limit filters.
- Zod-validated `GET /api/macro/series` endpoint with country, metric, source, date range, and limit filters.
- `/discovery` rates & macro panel showing the latest yield curve and matching macro observations.
- Seeded demo US yield curve and CPI/unemployment/GDP/Fed Funds observations for clean installs.

Notes:

- Provider ingestion is intentionally not part of this cut. Future adapters should write these global tables through the admin connection with super-admin RLS context, following the news ingest pattern.

## 6g — Fundamentals Provider Ingestion

Status: done.

Delivered:

- `packages/fundamentals` with a provider interface, Zod-backed snapshot normalization, deterministic `MockFundamentalsProvider`, optional Polygon ratios adapter, and unit tests.
- `services/fundamentals-ingest` background service that fetches normalized snapshots and upserts into `fundamental_snapshots`.
- Ingestion resolves provider tickers against the global `symbols` table, skips unknown symbols, and marks older latest snapshots false before writing new latest rows.
- Ingestion runs through `DATABASE_URL_ADMIN` with super-admin RLS context inside a transaction, matching the news ingest boundary.
- Root `pnpm fundamentals:ingest` command for one-shot local ingest; `pnpm --filter @tv/fundamentals-ingest start` runs the same worker on an interval.
- Env controls for provider, symbols, limit, interval, and optional `POLYGON_KEY` in `.env.example`.

Notes:

- `mock` remains the default provider for deterministic local development and tests.
- `polygon` uses the Polygon/Massive financial ratios endpoint and requires `POLYGON_KEY` plus explicit `FUNDAMENTALS_INGEST_SYMBOLS`.

## 6h — Yield Curve + Macro Provider Ingestion

Status: done.

Delivered:

- `packages/macro` with a provider interface, Zod-backed normalization for yield curve points and macro observations, deterministic `MockMacroProvider`, FRED adapter, and unit tests.
- `services/macro-ingest` background service that fetches normalized rates/macro data and upserts into `yield_curves` and `macro_series_observations`.
- FRED support for the US Treasury curve (`DGS3MO`, `DGS2`, `DGS5`, `DGS10`, `DGS30`) and core macro series (`CPIAUCSL`, `UNRATE`, `GDP`, `FEDFUNDS`).
- Ingestion runs through `DATABASE_URL_ADMIN` with super-admin RLS context inside a transaction, matching news/fundamentals ingest.
- Root `pnpm macro:ingest` command for one-shot local ingest; `pnpm --filter @tv/macro-ingest start` runs the same worker on an interval.
- Env controls for provider, country, date range, limit, interval, and optional `FRED_KEY` in `.env.example`.

Notes:

- `mock` remains the default provider for deterministic local development and tests.
- `fred` uses the official FRED `fred/series/observations` endpoint and currently supports US data only.

## 6i — Calendar Provider Ingestion

Status: done.

Delivered:

- `packages/calendar` with a provider interface, Zod-backed normalization for earnings/dividend/economic events, deterministic `MockCalendarProvider`, optional Financial Modeling Prep (FMP) adapter, provider registry, and unit tests.
- `services/calendar-ingest` background service that fetches normalized calendar events and upserts into `earnings_calendar`, `dividend_calendar`, and `economic_events`.
- Earnings and dividend ingestion resolves provider tickers against the global `symbols` table and skips unknown symbols; economic events ingest by country and need no symbol linkage.
- New `economic_events_country_event_name_uq` unique index (migration `0004_jazzy_salo`) makes the economic upsert idempotent; earnings/dividends reuse their existing symbol/date unique indexes.
- Ingestion runs through `DATABASE_URL_ADMIN` with super-admin RLS context inside a transaction, matching news/fundamentals/macro ingest.
- Root `pnpm calendars:ingest` command for one-shot local ingest; `pnpm --filter @tv/calendar-ingest start` runs the same worker on an interval.
- Env controls for provider, symbols, country, date range, limit, interval, and optional `FMP_KEY` in `.env.example`.

Notes:

- `mock` remains the default provider for deterministic local development and tests; it emits AAPL/MSFT earnings + dividends and US economic events so a seeded install upserts cleanly.
- `fmp` uses the Financial Modeling Prep `earning_calendar`, `stock_dividend_calendar`, and `economic_calendar` endpoints and requires `FMP_KEY`.

## 6j — Real News Provider Ingestion

Status: done.

Delivered:

- `NewsApiProvider` in `packages/news`: a real NewsAPI.org adapter over the `/v2/everything` endpoint with an injectable fetcher, authenticating via the `X-Api-Key` header.
- Per-symbol brand news: when `NEWS_INGEST_SYMBOLS` is set, the adapter queries each symbol separately and tags articles with that symbol; overlapping articles (same URL) merge their symbol lists. With no symbols it runs one general markets query.
- `createNewsProvider` now takes provider options and supports `newsapi`; `NEWS_PROVIDER` accepts `mock | newsapi`; `services/news-ingest` passes `NEWSAPI_KEY` through.
- Articles upsert into `news_articles` by URL through the existing news-ingest worker (admin/RLS-safe transaction), so `pnpm news:ingest` works with either provider.
- `NEWSAPI_KEY` is now validated in `EnvSchema` and documented next to the news block in `.env.example`.

Notes:

- `mock` remains the default provider for deterministic local development and tests.
- `newsapi` requires `NEWSAPI_KEY`; symbol tagging is query-based (ticker as the search term) since NewsAPI does not return native symbol tags.

## 6k — Finnhub News Provider

Status: done.

Delivered:

- `FinnhubNewsProvider` in `packages/news`: a real Finnhub adapter with an injectable fetcher, authenticating via the `token` query parameter.
- Per-symbol brand news through `/api/v1/company-news?symbol=&from=&to=` (one call per symbol, tagged with that symbol plus any tickers in Finnhub's `related` field; overlapping URLs merge symbol lists). With no symbols it calls `/api/v1/news?category=general` and tags from `related`.
- Finnhub returns unix-second `datetime`; the adapter converts to `publishedAt` Date and re-applies the `from`/`to` window after fetching. When the query omits a window for company news, it defaults to the trailing 7 days (clock injectable for deterministic tests).
- `createNewsProvider` supports `finnhub` via a `finnhubKey` option; `NEWS_PROVIDER` accepts `mock | newsapi | finnhub`; `services/news-ingest` passes `FINNHUB_KEY` through.
- `FINNHUB_KEY` is now validated in `EnvSchema` and documented next to the news block in `.env.example`.

Notes:

- `finnhub` requires `FINNHUB_KEY`; symbol tagging combines the queried ticker with Finnhub's native `related` tickers, so general-market news still gets symbol associations.

## Remaining Slice 6 Work

- Additional news providers (Benzinga) and richer sentiment.
- Additional fundamentals providers and broader metric coverage.
- Additional macro providers and non-US country mappings.
- Additional calendar providers (Finnhub, Benzinga) and per-symbol brand calendars.
