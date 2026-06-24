import ccxt, { type Exchange as CcxtExchange } from 'ccxt';
import type { Bar, BarQuery, Symbol, ProviderHealth, ProviderCapabilities } from '@tv/data-types';
import { type DataProvider, ProviderError } from '../provider.js';
import { IntervalSchema } from '@tv/core';

const SUPPORTED_INTERVALS: Record<string, string> = {
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
    if (!CCXT_INTERVALS.has(q.interval)) {
      throw new ProviderError(this.id, `interval ${q.interval} not supported`);
    }
    try {
      const tf = SUPPORTED_INTERVALS[q.interval]!;
      const since = q.from ?? Date.now() - 1000 * 60 * 60 * 24 * 365;
      const limit = Math.min(q.limit, 1000);
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
          time: Math.floor(ts / (isSeconds ? 1 : 1000)),
          open: o,
          high: h,
          low: l,
          close: c,
          volume: v ?? 0,
        }));
    } catch (e) {
      throw new ProviderError(this.id, `fetchOHLCV failed for ${q.symbol}`, e);
    }
  }

  subscribe(symbol: Symbol, onBar: (b: Bar) => void): () => void {
    let stopped = false;
    // Polling-based subscription. CCXT Binance doesn't expose watchOHLCV directly
    // in this build; we poll every 5s, fetch the latest 2 bars, emit new ones.
    // Cheap, reliable, and works without a long-lived WebSocket connection.
    let lastTime = 0;
    let backoffMs = 1000;
    const tick = async () => {
      while (!stopped) {
        try {
          const ohlcv = await this.exchange.fetchOHLCV(symbol.ticker, '1m', undefined, 2);
          for (const c of ohlcv) {
            const [ts, o, h, l, close, v] = c;
            if (ts === undefined || o === undefined) continue;
            const time = Math.floor(ts / 1000);
            if (time > lastTime) {
              onBar({ time, open: o, high: h ?? o, low: l ?? o, close: close ?? o, volume: v ?? 0 });
              lastTime = time;
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
