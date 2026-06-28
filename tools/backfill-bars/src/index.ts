#!/usr/bin/env bun
/**
 * Backfill the `bars` table from a CCXT exchange. Idempotent — safe to
 * re-run; the same (provider, ticker, interval, time) primary key is
 * upserted on conflict.
 *
 * Examples:
 *   pnpm backfill:bars --provider binance --ticker BTC/USDT --interval 1m --limit 1000
 *   pnpm backfill:bars --provider binance --ticker BTC/USDT,ETH/USDT --intervals 1m,5m,1h
 *   pnpm backfill:bars --provider binance --all --intervals 1m --limit 500
 */
import { z } from 'zod';
import { loadEnv } from '@tv/core';
import { createDb } from '@tv/db';
import { bars } from '@tv/db/schema';
import { IntervalSchema } from '@tv/core';
import { sql } from 'drizzle-orm';
import { ccxt } from '@tv/data-adapters';

const ArgsSchema = z.object({
  provider: z.string().default('binance'),
  ticker: z.string().optional(),
  tickers: z.string().optional(),
  all: z.boolean().default(false),
  interval: IntervalSchema.optional(),
  intervals: z.string().optional(),
  limit: z.coerce.number().int().positive().max(5000).default(1000),
});

const parseArgs = (argv: ReadonlyArray<string>): z.infer<typeof ArgsSchema> => {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return ArgsSchema.parse(args);
};

const main = async (): Promise<void> => {
  const env = loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const url = env.DATABASE_URL_ADMIN ?? env.DATABASE_URL;
  const db = createDb({ url });

  // Resolve providers and tickers.
  const providerMap: Record<string, () => ReturnType<typeof ccxt.createBinance>> = {
    binance: ccxt.createBinance,
    coinbase: ccxt.createCoinbase,
    kraken: ccxt.createKraken,
    bybit: ccxt.createBybit,
  };
  const providerFactory = providerMap[args.provider];
  if (!providerFactory) {
    console.error(`Unknown provider: ${args.provider}`);
    process.exit(1);
  }
  const provider = providerFactory();

  let tickers: string[] = [];
  if (args.ticker) {
    // Accept both single ('BTC/USDT') and comma-separated ('BTC/USDT,ETH/USDT')
    tickers = args.ticker.split(',').map((t) => t.trim()).filter(Boolean);
  } else if (args.tickers) {
    tickers = args.tickers.split(',').map((t) => t.trim()).filter(Boolean);
  } else if (args.all) {
    const fetched = await provider.fetchSymbols();
    tickers = fetched
      .filter((s) => s.assetClass === 'crypto')
      .map((s) => s.ticker);
    console.log(`Discovered ${tickers.length} ${args.provider} crypto tickers`);
  } else {
    console.error('Provide --ticker <X>, --ticker <X,Y> or --all');
    process.exit(1);
  }

  let intervals: string[] = [];
  if (args.interval) intervals = [args.interval];
  else if (args.intervals) intervals = args.intervals.split(',').map((i) => i.trim()).filter(Boolean);
  else intervals = ['1m'];

  console.log(
    `Backfilling ${tickers.length} tickers × ${intervals.length} intervals = ${tickers.length * intervals.length} jobs, limit=${args.limit} each`,
  );

  let totalWritten = 0;
  let totalSkipped = 0;
  for (const ticker of tickers) {
    for (const interval of intervals) {
      process.stdout.write(`  ${args.provider}:${ticker} ${interval} … `);
      let written = 0;
      let skipped = 0;
      try {
        const barsList = await provider.fetchHistorical({
          symbol: ticker,
          interval: interval as never,
          limit: args.limit,
        });
        if (barsList.length === 0) {
          console.log('no data');
          continue;
        }
        await db.transaction(async (tx) => {
          for (const bar of barsList) {
            const res = await tx
              .insert(bars)
              .values({
                provider: args.provider,
                ticker,
                interval,
                time: bar.time,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume,
                isClosed: true,
              })
              .onConflictDoUpdate({
                target: [bars.provider, bars.ticker, bars.interval, bars.time],
                set: {
                  open: sql`excluded.open`,
                  high: sql`excluded.high`,
                  low: sql`excluded.low`,
                  close: sql`excluded.close`,
                  volume: sql`excluded.volume`,
                },
              });
            // postgres.js returns an empty array for ON CONFLICT; we can't tell
            // insert vs update from the result. Just count attempts.
            written += 1;
            void res;
          }
        });
        totalWritten += written;
        console.log(`wrote ${written} (range ${barsList[0]!.time} → ${barsList[barsList.length - 1]!.time})`);
      } catch (e) {
        console.log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
        skipped += 1;
        totalSkipped += skipped;
      }
    }
  }

  console.log(`\nDone. Wrote ${totalWritten} bars, ${totalSkipped} errors.`);
  process.exit(0);
};

await main();
