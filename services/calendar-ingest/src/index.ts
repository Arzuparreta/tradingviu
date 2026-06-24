import { inArray, sql } from 'drizzle-orm';
import {
  CalendarIngestQuerySchema,
  EnvSchema,
  type CalendarIngestQuery,
  type NormalizedDividendEvent,
  type NormalizedEarningsEvent,
  type NormalizedEconomicEvent,
} from '@tv/core';
import { clearRls, createDb, withSuperAdminRls, type Database } from '@tv/db';
import { dividendCalendar, earningsCalendar, economicEvents, symbols } from '@tv/db/schema';
import {
  createCalendarProvider,
  fetchNormalizedCalendar,
  type CalendarProvider,
} from '@tv/calendar';

const CalendarIngestEnvSchema = EnvSchema.pick({
  DATABASE_URL: true,
  DATABASE_URL_ADMIN: true,
  CALENDAR_PROVIDER: true,
  CALENDAR_INGEST_INTERVAL_SECONDS: true,
  FMP_KEY: true,
});

export interface CalendarIngestResult {
  readonly provider: string;
  readonly earnings: number;
  readonly dividends: number;
  readonly economic: number;
  readonly skipped: number;
}

const parseSymbols = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbol.length > 0);
};

export const buildQueryFromEnv = (source: NodeJS.ProcessEnv = process.env): CalendarIngestQuery => {
  const input = {
    symbols: parseSymbols(source.CALENDAR_INGEST_SYMBOLS),
    ...(source.CALENDAR_INGEST_COUNTRY ? { country: source.CALENDAR_INGEST_COUNTRY } : {}),
    ...(source.CALENDAR_INGEST_FROM ? { from: source.CALENDAR_INGEST_FROM } : {}),
    ...(source.CALENDAR_INGEST_TO ? { to: source.CALENDAR_INGEST_TO } : {}),
    ...(source.CALENDAR_INGEST_LIMIT ? { limit: source.CALENDAR_INGEST_LIMIT } : {}),
  };
  return CalendarIngestQuerySchema.parse(input);
};

const toEarningsRows = (
  events: readonly NormalizedEarningsEvent[],
  symbolIdsByTicker: ReadonlyMap<string, string>,
) =>
  events.flatMap((event) => {
    const symbolId = symbolIdsByTicker.get(event.symbol);
    if (!symbolId) return [];
    return [
      {
        symbolId,
        date: event.date,
        epsEstimate: event.epsEstimate ?? null,
        epsActual: event.epsActual ?? null,
        revenueEstimate: event.revenueEstimate ?? null,
        revenueActual: event.revenueActual ?? null,
      },
    ];
  });

const toDividendRows = (
  events: readonly NormalizedDividendEvent[],
  symbolIdsByTicker: ReadonlyMap<string, string>,
) =>
  events.flatMap((event) => {
    const symbolId = symbolIdsByTicker.get(event.symbol);
    if (!symbolId) return [];
    return [
      {
        symbolId,
        exDate: event.exDate,
        paymentDate: event.paymentDate ?? null,
        recordDate: event.recordDate ?? null,
        declarationDate: event.declarationDate ?? null,
        amount: event.amount,
        currency: event.currency,
        frequency: event.frequency ?? null,
      },
    ];
  });

const toEconomicRows = (events: readonly NormalizedEconomicEvent[]) =>
  events.map((event) => ({
    country: event.country,
    eventAt: event.eventAt,
    name: event.name,
    importance: event.importance,
    actual: event.actual ?? null,
    forecast: event.forecast ?? null,
    previous: event.previous ?? null,
  }));

const resolveSymbolIds = async (
  db: Database,
  tickers: readonly string[],
): Promise<ReadonlyMap<string, string>> => {
  const unique = [...new Set(tickers)];
  if (unique.length === 0) return new Map<string, string>();

  const rows = await db
    .select({ id: symbols.id, ticker: symbols.ticker })
    .from(symbols)
    .where(inArray(symbols.ticker, unique));

  return new Map(rows.map((row) => [row.ticker.toUpperCase(), row.id]));
};

export const ingestCalendarOnce = async (
  db: Database,
  provider: CalendarProvider,
  query: CalendarIngestQuery,
): Promise<CalendarIngestResult> => {
  const normalized = await fetchNormalizedCalendar(provider, query);
  const symbolIdsByTicker = await resolveSymbolIds(db, [
    ...normalized.earnings.map((event) => event.symbol),
    ...normalized.dividends.map((event) => event.symbol),
  ]);

  const earningsRows = toEarningsRows(normalized.earnings, symbolIdsByTicker);
  const dividendRows = toDividendRows(normalized.dividends, symbolIdsByTicker);
  const economicRows = toEconomicRows(normalized.economic);

  const symbolEventsTotal = normalized.earnings.length + normalized.dividends.length;
  const skipped = symbolEventsTotal - (earningsRows.length + dividendRows.length);

  const result = await db.transaction(async (txDb) => {
    await withSuperAdminRls(txDb as never, 'calendar-ingest');
    try {
      const upsertedEarnings =
        earningsRows.length === 0
          ? []
          : await txDb
              .insert(earningsCalendar)
              .values(earningsRows)
              .onConflictDoUpdate({
                target: [earningsCalendar.symbolId, earningsCalendar.date],
                set: {
                  epsEstimate: sql`excluded.eps_estimate`,
                  epsActual: sql`excluded.eps_actual`,
                  revenueEstimate: sql`excluded.revenue_estimate`,
                  revenueActual: sql`excluded.revenue_actual`,
                },
              })
              .returning({ id: earningsCalendar.id });

      const upsertedDividends =
        dividendRows.length === 0
          ? []
          : await txDb
              .insert(dividendCalendar)
              .values(dividendRows)
              .onConflictDoUpdate({
                target: [dividendCalendar.symbolId, dividendCalendar.exDate],
                set: {
                  paymentDate: sql`excluded.payment_date`,
                  recordDate: sql`excluded.record_date`,
                  declarationDate: sql`excluded.declaration_date`,
                  amount: sql`excluded.amount`,
                  currency: sql`excluded.currency`,
                  frequency: sql`excluded.frequency`,
                },
              })
              .returning({ id: dividendCalendar.id });

      const upsertedEconomic =
        economicRows.length === 0
          ? []
          : await txDb
              .insert(economicEvents)
              .values(economicRows)
              .onConflictDoUpdate({
                target: [economicEvents.country, economicEvents.eventAt, economicEvents.name],
                set: {
                  importance: sql`excluded.importance`,
                  actual: sql`excluded.actual`,
                  forecast: sql`excluded.forecast`,
                  previous: sql`excluded.previous`,
                },
              })
              .returning({ id: economicEvents.id });

      return {
        earnings: upsertedEarnings.length,
        dividends: upsertedDividends.length,
        economic: upsertedEconomic.length,
      };
    } finally {
      await clearRls(txDb as never);
    }
  });

  return {
    provider: provider.id,
    earnings: result.earnings,
    dividends: result.dividends,
    economic: result.economic,
    skipped,
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const run = async (): Promise<void> => {
  const env = CalendarIngestEnvSchema.parse(process.env);
  const provider = createCalendarProvider(
    env.CALENDAR_PROVIDER,
    env.FMP_KEY ? { fmpKey: env.FMP_KEY } : {},
  );
  const adminUrl = env.DATABASE_URL_ADMIN ?? env.DATABASE_URL;
  const db = createDb({ url: adminUrl, max: 1 });
  const query = buildQueryFromEnv();
  const intervalSeconds = env.CALENDAR_INGEST_INTERVAL_SECONDS;
  const once = process.argv.includes('--once');

  do {
    const result = await ingestCalendarOnce(db, provider, query);
    console.log(
      `[calendar-ingest] provider=${result.provider} earnings=${result.earnings} dividends=${result.dividends} economic=${result.economic} skipped=${result.skipped}`,
    );
    if (once) break;
    await sleep(intervalSeconds * 1000);
  } while (true);
};

if (import.meta.main) {
  run()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[calendar-ingest] failed: ${message}`);
      process.exit(1);
    });
}
