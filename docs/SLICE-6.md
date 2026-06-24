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

## Remaining Slice 6 Work

- News provider adapters and scheduled ingestion.
- Dividend calendar.
- Yield curves and macroeconomic series.
- Fundamentals storage and API.
- Expand screener to dedicated fundamentals storage once that table exists.
