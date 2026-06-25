import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  EnvSchema,
  FundamentalsIngestQuerySchema,
  loadEnv,
  type FundamentalsIngestQuery,
  type NormalizedFundamentalSnapshot,
} from '@tv/core';
import { clearRls, createDb, withSuperAdminRls, type Database } from '@tv/db';
import { fundamentalSnapshots, symbols } from '@tv/db/schema';
import {
  createFundamentalsProvider,
  fetchNormalizedFundamentals,
  type FundamentalsProvider,
} from '@tv/fundamentals';

const FundamentalsIngestEnvSchema = EnvSchema.pick({
  DATABASE_URL: true,
  DATABASE_URL_ADMIN: true,
  FUNDAMENTALS_PROVIDER: true,
  FUNDAMENTALS_INGEST_INTERVAL_SECONDS: true,
  POLYGON_KEY: true,
});

export interface FundamentalsIngestResult {
  readonly provider: string;
  readonly fetched: number;
  readonly upserted: number;
  readonly skipped: number;
}

const parseSymbols = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbol.length > 0);
};

export const buildQueryFromEnv = (
  source: NodeJS.ProcessEnv = process.env,
): FundamentalsIngestQuery => {
  const input = {
    symbols: parseSymbols(source.FUNDAMENTALS_INGEST_SYMBOLS),
    ...(source.FUNDAMENTALS_INGEST_LIMIT ? { limit: source.FUNDAMENTALS_INGEST_LIMIT } : {}),
  };
  return FundamentalsIngestQuerySchema.parse(input);
};

const metricValue = (value: number | null | undefined): number | null => value ?? null;

const toInsertRows = (
  snapshots: readonly NormalizedFundamentalSnapshot[],
  symbolIdsByTicker: ReadonlyMap<string, string>,
) =>
  snapshots.flatMap((snapshot) => {
    const symbolId = symbolIdsByTicker.get(snapshot.symbol);
    if (!symbolId) return [];
    return [
      {
        symbolId,
        fiscalPeriod: snapshot.fiscalPeriod,
        periodEnd: snapshot.periodEnd,
        source: snapshot.source,
        currency: snapshot.currency,
        isLatest: snapshot.isLatest,
        marketCap: metricValue(snapshot.marketCap),
        peRatio: metricValue(snapshot.peRatio),
        eps: metricValue(snapshot.eps),
        revenue: metricValue(snapshot.revenue),
        dividendYield: metricValue(snapshot.dividendYield),
        roe: metricValue(snapshot.roe),
        revenueGrowth: metricValue(snapshot.revenueGrowth),
        earningsGrowth: metricValue(snapshot.earningsGrowth),
        beta: metricValue(snapshot.beta),
        week52High: metricValue(snapshot.week52High),
        week52Low: metricValue(snapshot.week52Low),
        fetchedAt: snapshot.fetchedAt,
      },
    ];
  });

const resolveSymbolIds = async (
  db: Database,
  snapshots: readonly NormalizedFundamentalSnapshot[],
): Promise<ReadonlyMap<string, string>> => {
  const tickers = [...new Set(snapshots.map((snapshot) => snapshot.symbol))];
  if (tickers.length === 0) return new Map<string, string>();

  const rows = await db
    .select({ id: symbols.id, ticker: symbols.ticker })
    .from(symbols)
    .where(inArray(symbols.ticker, tickers));

  return new Map(rows.map((row) => [row.ticker.toUpperCase(), row.id]));
};

export const ingestFundamentalsOnce = async (
  db: Database,
  provider: FundamentalsProvider,
  query: FundamentalsIngestQuery,
): Promise<FundamentalsIngestResult> => {
  const snapshots = await fetchNormalizedFundamentals(provider, query);
  if (snapshots.length === 0) {
    return { provider: provider.id, fetched: 0, upserted: 0, skipped: 0 };
  }

  const symbolIdsByTicker = await resolveSymbolIds(db, snapshots);
  const rows = toInsertRows(snapshots, symbolIdsByTicker);
  if (rows.length === 0) {
    return {
      provider: provider.id,
      fetched: snapshots.length,
      upserted: 0,
      skipped: snapshots.length,
    };
  }

  const upserted = await db.transaction(async (txDb) => {
    await withSuperAdminRls(txDb as never, 'fundamentals-ingest');
    try {
      const latestRows = rows.filter((row) => row.isLatest);
      const latestSymbolIds = [...new Set(latestRows.map((row) => row.symbolId))];
      const latestFiscalPeriods = [...new Set(latestRows.map((row) => row.fiscalPeriod))];
      for (const fiscalPeriod of latestFiscalPeriods) {
        await txDb
          .update(fundamentalSnapshots)
          .set({ isLatest: false })
          .where(
            and(
              inArray(fundamentalSnapshots.symbolId, latestSymbolIds),
              eq(fundamentalSnapshots.fiscalPeriod, fiscalPeriod),
              eq(fundamentalSnapshots.isLatest, true),
            ),
          );
      }

      return await txDb
        .insert(fundamentalSnapshots)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            fundamentalSnapshots.symbolId,
            fundamentalSnapshots.fiscalPeriod,
            fundamentalSnapshots.periodEnd,
          ],
          set: {
            source: sql`excluded.source`,
            currency: sql`excluded.currency`,
            isLatest: sql`excluded.is_latest`,
            marketCap: sql`excluded.market_cap`,
            peRatio: sql`excluded.pe_ratio`,
            eps: sql`excluded.eps`,
            revenue: sql`excluded.revenue`,
            dividendYield: sql`excluded.dividend_yield`,
            roe: sql`excluded.roe`,
            revenueGrowth: sql`excluded.revenue_growth`,
            earningsGrowth: sql`excluded.earnings_growth`,
            beta: sql`excluded.beta`,
            week52High: sql`excluded.week_52_high`,
            week52Low: sql`excluded.week_52_low`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        })
        .returning({ id: fundamentalSnapshots.id });
    } finally {
      await clearRls(txDb as never);
    }
  });

  return {
    provider: provider.id,
    fetched: snapshots.length,
    upserted: upserted.length,
    skipped: snapshots.length - rows.length,
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const run = async (): Promise<void> => {
  loadEnv();
  const env = FundamentalsIngestEnvSchema.parse(process.env);
  const provider = createFundamentalsProvider(
    env.FUNDAMENTALS_PROVIDER,
    env.POLYGON_KEY ? { polygonKey: env.POLYGON_KEY } : {},
  );
  const adminUrl = env.DATABASE_URL_ADMIN ?? env.DATABASE_URL;
  const db = createDb({ url: adminUrl, max: 1 });
  const query = buildQueryFromEnv();
  const intervalSeconds = env.FUNDAMENTALS_INGEST_INTERVAL_SECONDS;
  const once = process.argv.includes('--once');

  do {
    const result = await ingestFundamentalsOnce(db, provider, query);
    console.log(
      `[fundamentals-ingest] provider=${result.provider} fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped}`,
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
      console.error(`[fundamentals-ingest] failed: ${message}`);
      process.exit(1);
    });
}
