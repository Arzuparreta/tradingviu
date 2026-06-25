import { describe, expect, test } from 'bun:test';
import type { Exchange as CcxtExchange } from 'ccxt';
import type { BarQuery, Symbol } from '@tv/data-types';
import type { BarEvent } from '../provider.js';
import { CcxtProvider } from './binance.js';

const HOUR_MS = 3_600_000;

interface OhlcvCall {
  symbol: string;
  tf: string;
  since: number | undefined;
  limit: number;
}

function makeProvider(ohlcv: number[][]): { provider: CcxtProvider; calls: OhlcvCall[] } {
  const calls: OhlcvCall[] = [];
  const exchange = {
    fetchOHLCV: async (symbol: string, tf: string, since?: number, limit?: number) => {
      calls.push({ symbol, tf, since, limit: limit ?? 0 });
      return ohlcv;
    },
  } as unknown as CcxtExchange;
  return { provider: new CcxtProvider('binance', exchange), calls };
}

const candle = (ts: number): number[] => [ts, 1, 2, 0.5, 1.5, 10];

const symbol: Symbol = {
  id: 'binance:BTC/USDT',
  exchange: 'BINANCE',
  ticker: 'BTC/USDT',
  name: 'BTC/USDT',
  assetClass: 'crypto',
  currency: 'USD',
  active: true,
  metadata: {},
};

describe('CcxtProvider.fetchHistorical range', () => {
  test('derives `since` from `to - interval*limit` when only `to` is given and drops bars past `to`', async () => {
    const to = 1_700_000_000_000;
    const { provider, calls } = makeProvider([
      candle(to - 2 * HOUR_MS),
      candle(to - HOUR_MS),
      candle(to),
      candle(to + HOUR_MS),
    ]);
    const q: BarQuery = { symbol: 'BTC/USDT', interval: '1h', to, limit: 5 };
    const bars = await provider.fetchHistorical(q);

    expect(calls[0]!.since).toBe(to - HOUR_MS * 5);
    expect(calls[0]!.limit).toBe(5);
    expect(bars.map((b) => b.time)).toEqual([
      Math.floor((to - 2 * HOUR_MS) / 1000),
      Math.floor((to - HOUR_MS) / 1000),
      Math.floor(to / 1000),
    ]);
  });

  test('converts a second-precision `from` to milliseconds for ccxt', async () => {
    const fromSec = 1_699_000_000; // < 1e10 → treated as seconds
    const { provider, calls } = makeProvider([]);
    const q: BarQuery = { symbol: 'BTC/USDT', interval: '1h', from: fromSec, limit: 5 };
    await provider.fetchHistorical(q);

    expect(calls[0]!.since).toBe(fromSec * 1000);
  });

  test('filters returned bars to the [from, to] window', async () => {
    const from = 1_699_900_000_000;
    const to = 1_700_000_000_000;
    const { provider } = makeProvider([
      candle(from - HOUR_MS),
      candle(from),
      candle(to),
      candle(to + HOUR_MS),
    ]);
    const q: BarQuery = { symbol: 'BTC/USDT', interval: '1h', from, to, limit: 100 };
    const bars = await provider.fetchHistorical(q);

    expect(bars.map((b) => b.time)).toEqual([Math.floor(from / 1000), Math.floor(to / 1000)]);
  });
});

describe('CcxtProvider.subscribe', () => {
  test('polls the requested interval timeframe, not a hardcoded 1m', async () => {
    const { provider, calls } = makeProvider([]);
    const unsub = provider.subscribe(symbol, () => {}, '5m');
    await new Promise((r) => setTimeout(r, 20));
    unsub();

    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]!.tf).toBe('5m');
  });

  test('emits update on first poll for the in-progress bar', async () => {
    const t = Math.floor(Date.now() / 1000);
    const ohlcv = [[t * 1000, 1, 2, 0.5, 1.5, 10]];
    const exchange = {
      fetchOHLCV: async () => ohlcv,
    } as unknown as CcxtExchange;
    const provider = new CcxtProvider('binance', exchange);
    const events: BarEvent[] = [];
    const unsub = provider.subscribe(symbol, (e) => events.push(e), '1m');
    await new Promise((r) => setTimeout(r, 30));
    unsub();

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.kind).toBe('update');
    expect(events[0]!.bar.time).toBe(t);
  });

  test('emits close for the previous in-progress bar when the time changes', async () => {
    const t1 = Math.floor(Date.now() / 1000) - 60;
    const t2 = t1 + 60;
    let poll = 0;
    const exchange = {
      fetchOHLCV: async () => {
        poll += 1;
        if (poll === 1) return [[t1 * 1000, 1, 2, 0.5, 1.5, 10]];
        return [[t2 * 1000, 2, 3, 1.5, 2.5, 20]];
      },
    } as unknown as CcxtExchange;
    const provider = new CcxtProvider('binance', exchange);
    const events: BarEvent[] = [];
    const unsub = provider.subscribe(symbol, (e) => events.push(e), '1m');
    // Poll interval is 1s; wait 1.2s to be sure both polls fire.
    await new Promise((r) => setTimeout(r, 1200));
    unsub();

    // Expect at least: update(t1), close(t1), update(t2)
    const updateT1 = events.find((e) => e.bar.time === t1 && e.kind === 'update');
    const closeT1 = events.find((e) => e.bar.time === t1 && e.kind === 'close');
    const updateT2 = events.find((e) => e.bar.time === t2 && e.kind === 'update');
    expect(updateT1).toBeDefined();
    expect(closeT1).toBeDefined();
    expect(updateT2).toBeDefined();
  });

  test('does not emit close when the in-progress time has not changed', async () => {
    const t = Math.floor(Date.now() / 1000);
    let poll = 0;
    const exchange = {
      fetchOHLCV: async () => {
        poll += 1;
        return [[t * 1000, 1 + poll * 0.1, 2, 0.5, 1.5, 10]];
      },
    } as unknown as CcxtExchange;
    const provider = new CcxtProvider('binance', exchange);
    const events: BarEvent[] = [];
    const unsub = provider.subscribe(symbol, (e) => events.push(e), '1m');
    // Poll interval is 1s; wait 1.2s to be sure at least 2 polls fire.
    await new Promise((r) => setTimeout(r, 1200));
    unsub();

    const closes = events.filter((e) => e.kind === 'close');
    expect(closes.length).toBe(0);
    const updates = events.filter((e) => e.kind === 'update' && e.bar.time === t);
    expect(updates.length).toBeGreaterThanOrEqual(2);
  });
});
