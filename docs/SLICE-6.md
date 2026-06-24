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

## Remaining Slice 6 Work

- News provider adapters and scheduled ingestion.
- Dividend calendar.
- Yield curves and macroeconomic series.
- Fundamentals storage and API.
- Screener engine and saved presets.
