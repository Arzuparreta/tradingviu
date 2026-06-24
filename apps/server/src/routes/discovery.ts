import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import {
  DividendCalendarQuerySchema,
  EconomicCalendarQuerySchema,
  EarningsCalendarQuerySchema,
  FundamentalsQuerySchema,
  MacroSeriesQuerySchema,
  NewsQuerySchema,
  YieldCurveQuerySchema,
} from '@tv/core';
import {
  dividendCalendar,
  earningsCalendar,
  economicEvents,
  exchanges,
  fundamentalSnapshots,
  macroSeriesObservations,
  newsArticles,
  symbols,
  yieldCurves,
} from '@tv/db/schema';

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
  .get('/calendars/dividends', zValidator('query', DividendCalendarQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const filters: SQL[] = [];

    if (q.from) filters.push(gte(dividendCalendar.exDate, q.from));
    if (q.to) filters.push(lte(dividendCalendar.exDate, q.to));
    if (q.symbol) {
      const like = `%${q.symbol}%`;
      filters.push(
        or(eq(symbols.id, q.symbol), ilike(symbols.ticker, like), ilike(symbols.name, like))!,
      );
    }

    const rows = await db
      .select({
        id: dividendCalendar.id,
        exDate: dividendCalendar.exDate,
        paymentDate: dividendCalendar.paymentDate,
        recordDate: dividendCalendar.recordDate,
        declarationDate: dividendCalendar.declarationDate,
        amount: dividendCalendar.amount,
        currency: dividendCalendar.currency,
        frequency: dividendCalendar.frequency,
        symbol: {
          id: symbols.id,
          ticker: symbols.ticker,
          name: symbols.name,
          exchange: exchanges.code,
        },
      })
      .from(dividendCalendar)
      .innerJoin(symbols, eq(symbols.id, dividendCalendar.symbolId))
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(maybeWhere(filters))
      .orderBy(asc(dividendCalendar.exDate))
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
  })
  .get('/fundamentals', zValidator('query', FundamentalsQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const filters: SQL[] = [eq(fundamentalSnapshots.fiscalPeriod, q.fiscalPeriod)];

    if (q.latestOnly) filters.push(eq(fundamentalSnapshots.isLatest, true));
    if (q.symbol) {
      const like = `%${q.symbol}%`;
      filters.push(
        or(eq(symbols.id, q.symbol), ilike(symbols.ticker, like), ilike(symbols.name, like))!,
      );
    }

    const rows = await db
      .select({
        id: fundamentalSnapshots.id,
        fiscalPeriod: fundamentalSnapshots.fiscalPeriod,
        periodEnd: fundamentalSnapshots.periodEnd,
        source: fundamentalSnapshots.source,
        currency: fundamentalSnapshots.currency,
        isLatest: fundamentalSnapshots.isLatest,
        marketCap: fundamentalSnapshots.marketCap,
        peRatio: fundamentalSnapshots.peRatio,
        eps: fundamentalSnapshots.eps,
        revenue: fundamentalSnapshots.revenue,
        dividendYield: fundamentalSnapshots.dividendYield,
        roe: fundamentalSnapshots.roe,
        revenueGrowth: fundamentalSnapshots.revenueGrowth,
        earningsGrowth: fundamentalSnapshots.earningsGrowth,
        beta: fundamentalSnapshots.beta,
        week52High: fundamentalSnapshots.week52High,
        week52Low: fundamentalSnapshots.week52Low,
        fetchedAt: fundamentalSnapshots.fetchedAt,
        symbol: {
          id: symbols.id,
          ticker: symbols.ticker,
          name: symbols.name,
          exchange: exchanges.code,
        },
      })
      .from(fundamentalSnapshots)
      .innerJoin(symbols, eq(symbols.id, fundamentalSnapshots.symbolId))
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(maybeWhere(filters))
      .orderBy(desc(fundamentalSnapshots.periodEnd), symbols.ticker)
      .limit(q.limit);

    return c.json({ snapshots: rows });
  })
  .get('/macro/yield-curves', zValidator('query', YieldCurveQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const filters: SQL[] = [];

    if (q.country) filters.push(ilike(yieldCurves.country, q.country));
    if (q.source) filters.push(ilike(yieldCurves.source, q.source));
    if (q.from) filters.push(gte(yieldCurves.curveDate, q.from));
    if (q.to) filters.push(lte(yieldCurves.curveDate, q.to));
    if (q.latestOnly) {
      filters.push(sql`${yieldCurves.curveDate} = (
        SELECT max(yc.curve_date)
        FROM yield_curves yc
        WHERE yc.country = ${yieldCurves.country}
      )`);
    }

    const rows = await db
      .select({
        id: yieldCurves.id,
        country: yieldCurves.country,
        curveDate: yieldCurves.curveDate,
        tenorMonths: yieldCurves.tenorMonths,
        rate: yieldCurves.rate,
        currency: yieldCurves.currency,
        source: yieldCurves.source,
        fetchedAt: yieldCurves.fetchedAt,
      })
      .from(yieldCurves)
      .where(maybeWhere(filters))
      .orderBy(asc(yieldCurves.country), desc(yieldCurves.curveDate), asc(yieldCurves.tenorMonths))
      .limit(q.limit);

    return c.json({ points: rows });
  })
  .get('/macro/series', zValidator('query', MacroSeriesQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const filters: SQL[] = [];

    if (q.country) filters.push(ilike(macroSeriesObservations.country, q.country));
    if (q.metricCode) filters.push(ilike(macroSeriesObservations.metricCode, q.metricCode));
    if (q.source) filters.push(ilike(macroSeriesObservations.source, q.source));
    if (q.from) filters.push(gte(macroSeriesObservations.observedAt, q.from));
    if (q.to) filters.push(lte(macroSeriesObservations.observedAt, q.to));

    const rows = await db
      .select({
        id: macroSeriesObservations.id,
        country: macroSeriesObservations.country,
        metricCode: macroSeriesObservations.metricCode,
        metricName: macroSeriesObservations.metricName,
        observedAt: macroSeriesObservations.observedAt,
        value: macroSeriesObservations.value,
        unit: macroSeriesObservations.unit,
        frequency: macroSeriesObservations.frequency,
        source: macroSeriesObservations.source,
        fetchedAt: macroSeriesObservations.fetchedAt,
      })
      .from(macroSeriesObservations)
      .where(maybeWhere(filters))
      .orderBy(
        asc(macroSeriesObservations.country),
        asc(macroSeriesObservations.metricCode),
        asc(macroSeriesObservations.observedAt),
      )
      .limit(q.limit);

    return c.json({ observations: rows });
  });
