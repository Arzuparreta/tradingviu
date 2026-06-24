import { sql } from 'drizzle-orm';
import {
  EnvSchema,
  MacroIngestQuerySchema,
  type MacroIngestQuery,
  type NormalizedMacroSeriesObservation,
  type NormalizedYieldCurvePoint,
} from '@tv/core';
import { clearRls, createDb, withSuperAdminRls, type Database } from '@tv/db';
import { macroSeriesObservations, yieldCurves } from '@tv/db/schema';
import { createMacroProvider, fetchNormalizedMacro, type MacroProvider } from '@tv/macro';

const MacroIngestEnvSchema = EnvSchema.pick({
  DATABASE_URL: true,
  DATABASE_URL_ADMIN: true,
  MACRO_PROVIDER: true,
  MACRO_INGEST_INTERVAL_SECONDS: true,
  FRED_KEY: true,
});

export interface MacroIngestResult {
  readonly provider: string;
  readonly yieldCurvePoints: number;
  readonly macroObservations: number;
}

export const buildQueryFromEnv = (source: NodeJS.ProcessEnv = process.env): MacroIngestQuery => {
  const input = {
    ...(source.MACRO_INGEST_COUNTRY ? { country: source.MACRO_INGEST_COUNTRY } : {}),
    ...(source.MACRO_INGEST_FROM ? { from: source.MACRO_INGEST_FROM } : {}),
    ...(source.MACRO_INGEST_TO ? { to: source.MACRO_INGEST_TO } : {}),
    ...(source.MACRO_INGEST_LIMIT ? { limit: source.MACRO_INGEST_LIMIT } : {}),
  };
  return MacroIngestQuerySchema.parse(input);
};

const toYieldRows = (points: readonly NormalizedYieldCurvePoint[]) =>
  points.map((point) => ({
    country: point.country,
    curveDate: point.curveDate,
    tenorMonths: point.tenorMonths,
    rate: point.rate,
    currency: point.currency,
    source: point.source,
    fetchedAt: point.fetchedAt,
  }));

const toMacroRows = (observations: readonly NormalizedMacroSeriesObservation[]) =>
  observations.map((observation) => ({
    country: observation.country,
    metricCode: observation.metricCode,
    metricName: observation.metricName,
    observedAt: observation.observedAt,
    value: observation.value,
    unit: observation.unit,
    frequency: observation.frequency,
    source: observation.source,
    fetchedAt: observation.fetchedAt,
  }));

export const ingestMacroOnce = async (
  db: Database,
  provider: MacroProvider,
  query: MacroIngestQuery,
): Promise<MacroIngestResult> => {
  const normalized = await fetchNormalizedMacro(provider, query);
  const yieldRows = toYieldRows(normalized.yieldCurvePoints);
  const macroRows = toMacroRows(normalized.macroObservations);

  const result = await db.transaction(async (txDb) => {
    await withSuperAdminRls(txDb as never, 'macro-ingest');
    try {
      const upsertedYield =
        yieldRows.length === 0
          ? []
          : await txDb
              .insert(yieldCurves)
              .values(yieldRows)
              .onConflictDoUpdate({
                target: [
                  yieldCurves.country,
                  yieldCurves.curveDate,
                  yieldCurves.tenorMonths,
                  yieldCurves.source,
                ],
                set: {
                  rate: sql`excluded.rate`,
                  currency: sql`excluded.currency`,
                  fetchedAt: sql`excluded.fetched_at`,
                },
              })
              .returning({ id: yieldCurves.id });

      const upsertedMacro =
        macroRows.length === 0
          ? []
          : await txDb
              .insert(macroSeriesObservations)
              .values(macroRows)
              .onConflictDoUpdate({
                target: [
                  macroSeriesObservations.country,
                  macroSeriesObservations.metricCode,
                  macroSeriesObservations.observedAt,
                  macroSeriesObservations.source,
                ],
                set: {
                  metricName: sql`excluded.metric_name`,
                  value: sql`excluded.value`,
                  unit: sql`excluded.unit`,
                  frequency: sql`excluded.frequency`,
                  fetchedAt: sql`excluded.fetched_at`,
                },
              })
              .returning({ id: macroSeriesObservations.id });

      return { upsertedYield: upsertedYield.length, upsertedMacro: upsertedMacro.length };
    } finally {
      await clearRls(txDb as never);
    }
  });

  return {
    provider: provider.id,
    yieldCurvePoints: result.upsertedYield,
    macroObservations: result.upsertedMacro,
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const run = async (): Promise<void> => {
  const env = MacroIngestEnvSchema.parse(process.env);
  const provider = createMacroProvider(
    env.MACRO_PROVIDER,
    env.FRED_KEY ? { fredKey: env.FRED_KEY } : {},
  );
  const adminUrl = env.DATABASE_URL_ADMIN ?? env.DATABASE_URL;
  const db = createDb({ url: adminUrl, max: 1 });
  const query = buildQueryFromEnv();
  const intervalSeconds = env.MACRO_INGEST_INTERVAL_SECONDS;
  const once = process.argv.includes('--once');

  do {
    const result = await ingestMacroOnce(db, provider, query);
    console.log(
      `[macro-ingest] provider=${result.provider} yield_curve_points=${result.yieldCurvePoints} macro_observations=${result.macroObservations}`,
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
      console.error(`[macro-ingest] failed: ${message}`);
      process.exit(1);
    });
}
