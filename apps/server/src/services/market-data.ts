import { eq } from 'drizzle-orm';
import type { Database } from '@tv/db';
import { exchanges, symbols } from '@tv/db/schema';
import { intervalToMs, NotFoundError, type Interval } from '@tv/core';
import type { Bar } from '@tv/data-types';
import { ccxt } from '@tv/data-adapters';
import { getBarStore, getProvider } from './data.js';

export interface ResolvedMarketSymbol {
  readonly id: string;
  readonly ticker: string;
  readonly name: string;
  readonly exchange: string;
  readonly assetClass: string;
  readonly currency: string;
}

export interface FreshBarsOpts {
  readonly from?: number;
  readonly to?: number;
  readonly before?: number;
  readonly after?: number;
  readonly limit: number;
}

export interface FreshBarsResult {
  readonly symbol: ResolvedMarketSymbol;
  readonly provider: string;
  readonly providerTicker: string;
  readonly bars: Bar[];
  readonly source: 'barstore' | 'exchange';
  readonly asOf: number | null;
  readonly fresh: boolean;
}

const ccxtMap: Record<string, string> = {
  BINANCE: 'binance',
  COINBASE: 'coinbase',
  KRAKEN: 'kraken',
  BYBIT: 'bybit',
};

export const providerForExchange = (exchange: string): string => ccxtMap[exchange] ?? 'binance';

export const normalizeProviderTicker = (provider: string, ticker: string): string =>
  provider === 'binance' ? ccxt.toBinanceSymbol(ticker) : ticker;

const sortDedupe = (bars: readonly Bar[]): Bar[] => {
  const byTime = new Map<number, Bar>();
  for (const bar of bars) byTime.set(bar.time, bar);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
};

const isLatestRequest = (opts: FreshBarsOpts): boolean =>
  opts.to === undefined && opts.before === undefined;

const isFreshEnough = (bars: readonly Bar[], interval: Interval): boolean => {
  const last = bars.at(-1);
  if (!last) return false;
  const intervalSec = Math.floor(intervalToMs(interval) / 1000);
  const nowSec = Math.floor(Date.now() / 1000);
  return last.time >= nowSec - intervalSec * 2;
};

export const resolveMarketSymbol = async (
  db: Database,
  symbolId: string,
): Promise<{ symbol: ResolvedMarketSymbol; provider: string; providerTicker: string }> => {
  const [row] = await db
    .select({
      id: symbols.id,
      ticker: symbols.ticker,
      name: symbols.name,
      exchange: exchanges.code,
      assetClass: symbols.assetClass,
      currency: symbols.currency,
    })
    .from(symbols)
    .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
    .where(eq(symbols.id, symbolId))
    .limit(1);
  if (!row) throw new NotFoundError('Symbol not found', { symbol: symbolId });
  const provider = providerForExchange(row.exchange);
  return {
    symbol: row,
    provider,
    providerTicker: normalizeProviderTicker(provider, row.ticker),
  };
};

export const getFreshBars = async (
  db: Database,
  symbolId: string,
  interval: Interval,
  opts: FreshBarsOpts,
): Promise<FreshBarsResult> => {
  const resolved = await resolveMarketSymbol(db, symbolId);
  const latest = isLatestRequest(opts);
  const rangeFrom = opts.from ?? opts.after;
  const rangeTo = opts.to ?? (opts.before !== undefined ? opts.before - 1 : undefined);
  const key = {
    provider: resolved.provider,
    ticker: resolved.providerTicker,
    interval,
  };
  const barStore = getBarStore();

  if (latest) {
    await barStore.ensureStream(key);
  }

  let bars = await barStore.getRange(key, {
    ...(rangeFrom !== undefined ? { from: rangeFrom } : {}),
    ...(rangeTo !== undefined ? { to: rangeTo } : {}),
    limit: opts.limit,
  });
  let source: FreshBarsResult['source'] = 'barstore';
  const stale = latest && !isFreshEnough(bars, interval);

  if (bars.length < opts.limit || stale) {
    const provider = getProvider(resolved.provider);
    const exchangeBars = await provider.fetchHistorical({
      symbol: resolved.providerTicker,
      interval,
      ...(rangeFrom !== undefined ? { from: rangeFrom } : {}),
      ...(rangeTo !== undefined ? { to: rangeTo } : {}),
      limit: opts.limit,
    });
    const exchangeLast = exchangeBars.at(-1)?.time ?? 0;
    const currentLast = bars.at(-1)?.time ?? 0;
    if (exchangeBars.length > bars.length || exchangeLast > currentLast || stale) {
      bars = exchangeBars;
      source = 'exchange';
    }
  }

  bars = sortDedupe(bars).slice(-opts.limit);
  return {
    symbol: resolved.symbol,
    provider: resolved.provider,
    providerTicker: resolved.providerTicker,
    bars,
    source,
    asOf: bars.at(-1)?.time ?? null,
    fresh: latest ? isFreshEnough(bars, interval) : true,
  };
};
