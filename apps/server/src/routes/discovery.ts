import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import {
  EconomicCalendarQuerySchema,
  EarningsCalendarQuerySchema,
  NewsQuerySchema,
} from '@tv/core';
import { earningsCalendar, economicEvents, exchanges, newsArticles, symbols } from '@tv/db/schema';

const maybeWhere = (filters: readonly SQL[]): SQL | undefined =>
  filters.length > 0 ? and(...filters) : undefined;

const newsSymbolFilter = (symbol: string): SQL =>
  sql`EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(${newsArticles.symbols}) AS symbol_value(value)
    WHERE lower(symbol_value.value) = lower(${symbol})
  )`;

export const discoveryRoutes = new Hono()
  .get('/news', zValidator('query', NewsQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const filters: SQL[] = [];

    if (q.symbol) filters.push(newsSymbolFilter(q.symbol));
    if (q.source) filters.push(ilike(newsArticles.source, q.source));
    if (q.sentiment) filters.push(ilike(newsArticles.sentiment, q.sentiment));
    if (q.from) filters.push(gte(newsArticles.publishedAt, q.from));
    if (q.to) filters.push(lte(newsArticles.publishedAt, q.to));
    if (q.q) {
      const like = `%${q.q}%`;
      filters.push(or(ilike(newsArticles.title, like), ilike(newsArticles.body, like))!);
    }

    const rows = await db
      .select({
        id: newsArticles.id,
        source: newsArticles.source,
        url: newsArticles.url,
        title: newsArticles.title,
        body: newsArticles.body,
        symbols: newsArticles.symbols,
        sentiment: newsArticles.sentiment,
        publishedAt: newsArticles.publishedAt,
        fetchedAt: newsArticles.fetchedAt,
      })
      .from(newsArticles)
      .where(maybeWhere(filters))
      .orderBy(desc(newsArticles.publishedAt))
      .limit(q.limit);

    return c.json({ articles: rows });
  })
  .get('/calendars/earnings', zValidator('query', EarningsCalendarQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const filters: SQL[] = [];

    if (q.from) filters.push(gte(earningsCalendar.date, q.from));
    if (q.to) filters.push(lte(earningsCalendar.date, q.to));
    if (q.symbol) {
      const like = `%${q.symbol}%`;
      filters.push(
        or(eq(symbols.id, q.symbol), ilike(symbols.ticker, like), ilike(symbols.name, like))!,
      );
    }

    const rows = await db
      .select({
        id: earningsCalendar.id,
        date: earningsCalendar.date,
        epsEstimate: earningsCalendar.epsEstimate,
        epsActual: earningsCalendar.epsActual,
        revenueEstimate: earningsCalendar.revenueEstimate,
        revenueActual: earningsCalendar.revenueActual,
        symbol: {
          id: symbols.id,
          ticker: symbols.ticker,
          name: symbols.name,
          exchange: exchanges.code,
        },
      })
      .from(earningsCalendar)
      .innerJoin(symbols, eq(symbols.id, earningsCalendar.symbolId))
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(maybeWhere(filters))
      .orderBy(asc(earningsCalendar.date))
      .limit(q.limit);

    return c.json({ events: rows });
  })
  .get('/calendars/economic', zValidator('query', EconomicCalendarQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const filters: SQL[] = [];

    if (q.country) filters.push(ilike(economicEvents.country, q.country));
    if (q.importance) filters.push(eq(economicEvents.importance, q.importance));
    if (q.from) filters.push(gte(economicEvents.eventAt, q.from));
    if (q.to) filters.push(lte(economicEvents.eventAt, q.to));

    const rows = await db
      .select({
        id: economicEvents.id,
        country: economicEvents.country,
        eventAt: economicEvents.eventAt,
        name: economicEvents.name,
        importance: economicEvents.importance,
        actual: economicEvents.actual,
        forecast: economicEvents.forecast,
        previous: economicEvents.previous,
      })
      .from(economicEvents)
      .where(maybeWhere(filters))
      .orderBy(asc(economicEvents.eventAt))
      .limit(q.limit);

    return c.json({ events: rows });
  });
