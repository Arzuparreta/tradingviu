import ccxt, { type Exchange as CcxtExchange } from 'ccxt';
import type { Bar, BarQuery, Symbol, ProviderHealth, ProviderCapabilities } from '@tv/data-types';
import { type BarEventHandler, type DataProvider, ProviderError } from '../provider.js';
import { intervalToMs, type Interval } from '@tv/core';

const SUPPORTED_INTERVALS: Record<string, string> = {
  '1s': '1s',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
  '1M': '1M',
};

const CCXT_INTERVALS = new Set(Object.keys(SUPPORTED_INTERVALS));

const toCcxtTimestamp = (value: number): number => (value < 10_000_000_000 ? value * 1000 : value);
const toSeconds = (value: number): number => Math.floor(toCcxtTimestamp(value) / 1000);

export const toBinanceSymbol = (symbol: string): string =>
  symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const isBinanceKline = (value: unknown): value is [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
] =>
  Array.isArray(value) &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'string' &&
  typeof value[2] === 'string' &&
  typeof value[3] === 'string' &&
  typeof value[4] === 'string' &&
  typeof value[5] === 'string';

const fetchBinanceHistorical = async (q: BarQuery): Promise<Bar[]> => {
  if (!CCXT_INTERVALS.has(q.interval)) {
    throw new ProviderError('binance', `interval ${q.interval} not supported`);
  }
  const params = new URLSearchParams({
    symbol: toBinanceSymbol(q.symbol),
    interval: SUPPORTED_INTERVALS[q.interval]!,
    limit: String(Math.min(q.limit, 1000)),
  });
  if (q.from !== undefined) params.set('startTime', String(toCcxtTimestamp(q.from)));
  if (q.to !== undefined) params.set('endTime', String(toCcxtTimestamp(q.to)));
  const res = await fetch(`https://api.binance.com/api/v3/klines?${params.toString()}`);
  if (!res.ok) {
    throw new ProviderError('binance', `klines HTTP ${res.status} for ${q.symbol}`);
  }
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new ProviderError('binance', `klines returned invalid payload for ${q.symbol}`);
  }
  return raw
    .filter(isBinanceKline)
    .map((candle) => ({
      time: Math.floor(candle[0] / 1000),
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: Number(candle[5]),
      trades: candle[8],
    }))
    .filter(
      (bar) =>
        Number.isFinite(bar.open) &&
        Number.isFinite(bar.high) &&
        Number.isFinite(bar.low) &&
        Number.isFinite(bar.close) &&
        Number.isFinite(bar.volume) &&
        (q.from === undefined || bar.time >= toSeconds(q.from)) &&
        (q.to === undefined || bar.time <= toSeconds(q.to)),
    );
};

export class CcxtProvider implements DataProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities = {
    realtime: true,
    historical: true,
    fundamentals: false,
    news: false,
    calendar: false,
    requiresKey: false,
    assetClasses: ['crypto'],
  };

  private exchange: CcxtExchange;

  constructor(id: string, exchange: CcxtExchange) {
    this.id = id;
    this.exchange = exchange;
  }

  async fetchSymbols(): Promise<Symbol[]> {
    try {
      await this.exchange.loadMarkets();
      const out: Symbol[] = [];
      for (const m of Object.values(this.exchange.markets)) {
        if (m.type !== 'spot' && m.type !== 'swap') continue;
        if (!m.active) continue;
        if (!m.quote) continue;
        out.push({
          id: `${this.id}:${m.symbol}`,
          exchange: this.id.toUpperCase(),
          ticker: m.symbol,
          name: `${m.base}/${m.quote}`,
          assetClass: 'crypto',
          currency: m.quote,
          baseCurrency: m.base,
          quoteCurrency: m.quote,
          metadata: { type: m.type, precision: m.precision, limits: m.limits },
          active: true,
        });
      }
      return out;
    } catch (e) {
      throw new ProviderError(this.id, 'loadMarkets failed', e);
    }
  }

  async fetchHistorical(q: BarQuery): Promise<Bar[]> {
    if (this.id === 'binance') {
      return fetchBinanceHistorical(q).catch((e) => {
        throw e instanceof ProviderError ? e : new ProviderError(this.id, `fetch klines failed for ${q.symbol}`, e);
      });
    }
    if (!CCXT_INTERVALS.has(q.interval)) {
      throw new ProviderError(this.id, `interval ${q.interval} not supported`);
    }
    try {
      const tf = SUPPORTED_INTERVALS[q.interval]!;
      const limit = Math.min(q.limit, 1000);
      const toMs = q.to === undefined ? undefined : toCcxtTimestamp(q.to);
      const since =
        q.from === undefined
          ? toMs === undefined
            ? undefined
            : Math.max(0, toMs - intervalToMs(q.interval) * limit)
          : toCcxtTimestamp(q.from);
      const ohlcv = await this.exchange.fetchOHLCV(q.symbol, tf, since, limit);
      const isSeconds = q.interval === '1s' || q.interval === '5s' || q.interval === '15s' || q.interval === '30s';
      return ohlcv
        .filter((candle): candle is [number, number, number, number, number, number] =>
          candle[0] !== undefined &&
          candle[1] !== undefined &&
          candle[2] !== undefined &&
          candle[3] !== undefined &&
          candle[4] !== undefined,
        )
        .map(([ts, o, h, l, c, v]) => ({
          time: isSeconds && ts < 10_000_000_000 ? Math.floor(ts) : Math.floor(ts / 1000),
          open: o,
          high: h,
          low: l,
          close: c,
          volume: v ?? 0,
        }))
        .filter(
          (bar) =>
            (q.from === undefined || bar.time >= toSeconds(q.from)) &&
            (q.to === undefined || bar.time <= toSeconds(q.to)),
        );
    } catch (e) {
      throw new ProviderError(this.id, `fetchOHLCV failed for ${q.symbol}`, e);
    }
  }

  subscribe(symbol: Symbol, onEvent: BarEventHandler, interval: Interval = '1m'): () => void {
    let stopped = false;
    // Polling-based subscription. CCXT Binance's watchOHLCV requires a Pro key,
    // so we poll every 1s and emit the latest bar on every poll. `update` is
    // emitted for the in-progress bar (re-fires while its time is unchanged);
    // `close` is emitted exactly once when the bar's time changes.
    let inProgressBar: Bar | null = null;
    let inProgressTime: number | null = null;
    let backoffMs = 1000;
    const tick = async () => {
      while (!stopped) {
        try {
          const tf = SUPPORTED_INTERVALS[interval] ?? '1m';
          const ohlcv = await this.exchange.fetchOHLCV(symbol.ticker, tf, undefined, 2);
          const latest = ohlcv[ohlcv.length - 1];
          if (latest) {
            const [ts, o, h, l, cl, v] = latest;
            if (ts !== undefined && o !== undefined) {
              const time = Math.floor(ts / 1000);
              const bar: Bar = {
                time,
                open: o,
                high: h ?? o,
                low: l ?? o,
                close: cl ?? o,
                volume: v ?? 0,
              };
              if (inProgressTime === null) {
                onEvent({ kind: 'update', bar });
                inProgressTime = time;
                inProgressBar = bar;
              } else if (time > inProgressTime) {
                if (inProgressBar) onEvent({ kind: 'close', bar: inProgressBar });
                onEvent({ kind: 'update', bar });
                inProgressTime = time;
                inProgressBar = bar;
              } else {
                onEvent({ kind: 'update', bar });
                inProgressBar = bar;
              }
            }
          }
          backoffMs = 1000;
        } catch (e) {
          void e;
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(backoffMs * 2, 30_000);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    };
    tick();
    return () => {
      stopped = true;
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const t0 = Date.now();
    try {
      await this.exchange.fetchTicker('BTC/USDT');
      return {
        provider: this.id as ProviderHealth['provider'],
        status: 'healthy',
        latencyMs: Date.now() - t0,
        checkedAt: Date.now(),
      };
    } catch (e) {
      return {
        provider: this.id as ProviderHealth['provider'],
        status: 'down',
        lastError: e instanceof Error ? e.message : String(e),
        checkedAt: Date.now(),
      };
    }
  }
}

export const createBinance = () =>
  new CcxtProvider('binance', new ccxt.binance({ enableRateLimit: true }));

export const createCoinbase = () =>
  new CcxtProvider('coinbase', new ccxt.coinbase({ enableRateLimit: true }));

export const createKraken = () =>
  new CcxtProvider('kraken', new ccxt.kraken({ enableRateLimit: true }));

export const createBybit = () =>
  new CcxtProvider('bybit', new ccxt.bybit({ enableRateLimit: true }));
