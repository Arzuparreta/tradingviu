import { describe, expect, test, beforeEach } from 'bun:test';
import { BarStore } from './bar-store.js';
import type { Bar, BarQuery, Symbol, ProviderHealth } from '@tv/data-types';
import type { DataProvider, BarEventHandler } from '@tv/data-adapters';
import type { Stream, StreamEvent, StreamKey } from './streams/types.js';

const mockBar = (time: number, close: number): Bar => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 100,
});

/** A controllable stream that pushes events manually. */
class FakeStream implements Stream {
  private onEvent: ((e: StreamEvent) => void) | null = null;
  public started = false;
  public stopped = false;
  constructor(public readonly key: StreamKey) {}
  start(cb: (e: StreamEvent) => void): void {
    this.started = true;
    this.onEvent = cb;
  }
  stop(): void {
    this.stopped = true;
    this.onEvent = null;
  }
  push(event: StreamEvent): void {
    this.onEvent?.(event);
  }
}

class FakeProvider implements DataProvider {
  readonly id: string;
  readonly capabilities: DataProvider['capabilities'] = {
    realtime: true,
    historical: true,
    fundamentals: false,
    news: false,
    calendar: false,
    requiresKey: false,
    assetClasses: ['crypto'],
  };
  private streams = new Map<string, FakeStream>();
  public fetchCalls: BarQuery[] = [];
  public fetchResult: Bar[] = [];
  public onSubscribe?: (key: StreamKey) => void;
  public subscribeCount = 0;
  constructor(id: string) {
    this.id = id;
  }
  async fetchSymbols(): Promise<Symbol[]> {
    return [];
  }
  async fetchHistorical(q: BarQuery): Promise<Bar[]> {
    this.fetchCalls.push(q);
    return this.fetchResult;
  }
  subscribe(_s: Symbol, _cb: BarEventHandler, interval?: never): () => void {
    this.subscribeCount += 1;
    const key: StreamKey = { provider: this.id, ticker: _s.ticker, interval: (interval ?? '1m') as never };
    this.onSubscribe?.(key);
    return () => {};
  }
  async healthCheck(): Promise<ProviderHealth> {
    return { provider: this.id as never, status: 'healthy', latencyMs: 0, checkedAt: Date.now() };
  }
  getOrCreateStream(key: StreamKey): FakeStream {
    let s = this.streams.get(key.ticker + ':' + key.interval);
    if (!s) {
      s = new FakeStream(key);
      this.streams.set(key.ticker + ':' + key.interval, s);
    }
    return s;
  }
}

/**
 * A stub `db` that records the operations the BarStore uses. We don't need a
 * real Postgres connection for these unit tests.
 */
const makeStubDb = (): { select: () => never; transaction: (cb: (tx: never) => Promise<void>) => Promise<void>; execute: () => Promise<void> } => {
  return {
    select: () => {
      throw new Error('not implemented in stub');
    },
    transaction: async (cb) => {
      const tx = {
        insert: () => ({
          values: () => ({
            onConflictDoUpdate: () => Promise.resolve(),
          }),
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => Promise.resolve([]),
              }),
            }),
          }),
        }),
        execute: () => Promise.resolve(),
      } as never;
      await cb(tx);
    },
    execute: () => Promise.resolve(),
  };
};

describe('BarStore', () => {
  let provider: FakeProvider;
  let barStore: BarStore;
  let db: ReturnType<typeof makeStubDb>;
  let fakeStreams: FakeStream[];

  beforeEach(() => {
    provider = new FakeProvider('binance');
    db = makeStubDb();
    fakeStreams = [];
    barStore = new BarStore(db as never, ((id: string) => provider) as never, {
      systemUserId: 'test',
      backfillLimit: 100,
      idleTimeoutMs: 100,
      createStream: ({ key }) => {
        const s = new FakeStream(key);
        fakeStreams.push(s);
        return s;
      },
    });
  });

  test('subscribe activates an upstream after the first listener', async () => {
    // First subscription triggers backfill + upstream.
    provider.fetchResult = [mockBar(100, 10)];
    const events: string[] = [];
    const unsub = barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      (e) => events.push(e.kind),
    );
    // Wait a microtask for the activate() promise to resolve.
    await new Promise((r) => setTimeout(r, 10));
    expect(fakeStreams.length).toBe(1);
    expect(fakeStreams[0]!.started).toBe(true);
    unsub();
  });

  test('two subscribers on the same key share a single upstream', async () => {
    provider.fetchResult = [mockBar(100, 10)];
    const unsub1 = barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      () => {},
    );
    const unsub2 = barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      () => {},
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(fakeStreams.length).toBe(1);
    unsub1();
    unsub2();
  });

  test('emits status event to a newly subscribed listener', async () => {
    provider.fetchResult = [mockBar(100, 10)];
    const statuses: string[] = [];
    const unsub = barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      (e) => {
        if (e.kind === 'status') statuses.push(e.status);
      },
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(statuses[0]).toBeDefined();
    unsub();
  });

  test('getRecent returns the backfilled bars', async () => {
    provider.fetchResult = [mockBar(100, 10), mockBar(160, 11), mockBar(220, 12)];
    barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      () => {},
    );
    await new Promise((r) => setTimeout(r, 10));
    const recent = barStore.getRecent({ provider: 'binance', ticker: 'BTC/USDT', interval: '1m' }, 10);
    expect(recent.length).toBe(3);
    expect(recent[0]!.time).toBe(100);
    expect(recent[2]!.time).toBe(220);
  });

  test('getRecent caps at the requested limit', async () => {
    provider.fetchResult = Array.from({ length: 50 }, (_, i) => mockBar(i * 60, 10 + i));
    barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      () => {},
    );
    await new Promise((r) => setTimeout(r, 10));
    const recent = barStore.getRecent({ provider: 'binance', ticker: 'BTC/USDT', interval: '1m' }, 5);
    expect(recent.length).toBe(5);
    expect(recent[4]!.time).toBe(49 * 60);
  });

  test('range query in memory returns the right window', async () => {
    provider.fetchResult = Array.from({ length: 10 }, (_, i) => mockBar(100 + i * 60, 10 + i));
    barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      () => {},
    );
    await new Promise((r) => setTimeout(r, 10));
    const range = await barStore.getRange(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      { from: 100 + 3 * 60, to: 100 + 6 * 60, limit: 100 },
    );
    expect(range.length).toBe(4);
    expect(range[0]!.time).toBe(100 + 3 * 60);
    expect(range[3]!.time).toBe(100 + 6 * 60);
  });

  test('range query in memory returns the NEWEST N bars, not the oldest (ASC buffer + limit)', async () => {
    // Buffer is ASC by time. slice(0, limit) would return the OLDEST, but
    // the chart wants the NEWEST N. This test guards against a regression
    // where the wrong slice was taken (which made the chart show 17h-old
    // bars instead of the live ones).
    provider.fetchResult = Array.from({ length: 100 }, (_, i) => mockBar(1_000_000 + i * 60, 10 + i));
    barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      () => {},
    );
    await new Promise((r) => setTimeout(r, 10));
    const range = await barStore.getRange(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      { limit: 5 },
    );
    expect(range.length).toBe(5);
    expect(range[0]!.time).toBe(1_000_000 + 95 * 60);
    expect(range[4]!.time).toBe(1_000_000 + 99 * 60);
  });

  test('range query in memory includes the in-progress bar at the end', async () => {
    provider.fetchResult = Array.from({ length: 5 }, (_, i) => mockBar(100 + i * 60, 10 + i));
    barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      () => {},
    );
    await new Promise((r) => setTimeout(r, 10));
    // Simulate the in-progress bar arriving 1 minute after the last closed.
    const stream = fakeStreams[0]!;
    stream.push({ kind: 'update', bar: mockBar(100 + 5 * 60, 99) });
    await new Promise((r) => setTimeout(r, 5));
    const range = await barStore.getRange(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      { limit: 10 },
    );
    expect(range.length).toBe(6);
    expect(range[5]!.time).toBe(100 + 5 * 60);
    expect(range[5]!.close).toBe(99);
  });

  test('stats reports keys, status, listeners, buffered count', async () => {
    provider.fetchResult = [mockBar(100, 10), mockBar(160, 11)];
    const unsub = barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      () => {},
    );
    await new Promise((r) => setTimeout(r, 10));
    const s = barStore.stats();
    expect(s.length).toBe(1);
    expect(s[0]!.listeners).toBe(1);
    expect(s[0]!.buffered).toBe(2);
    unsub();
  });

  test('forwards "update" and "close" events from the upstream to listeners', async () => {
    provider.fetchResult = [mockBar(100, 10)];
    const events: { kind: string; time: number }[] = [];
    const unsub = barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      (e) => {
        if (e.kind !== 'status') events.push({ kind: e.kind, time: e.bar.time });
      },
    );
    await new Promise((r) => setTimeout(r, 10));
    const stream = fakeStreams[0]!;
    stream.push({ kind: 'update', bar: mockBar(160, 11) });
    stream.push({ kind: 'update', bar: mockBar(160, 12) });
    stream.push({ kind: 'update', bar: mockBar(220, 13) });
    stream.push({ kind: 'close', bar: mockBar(160, 12) });
    unsub();
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('update');
    expect(kinds).toContain('close');
  });

  test('getRecent reflects bars appended via "close" events', async () => {
    provider.fetchResult = [mockBar(100, 10)];
    barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      () => {},
    );
    await new Promise((r) => setTimeout(r, 10));
    const stream = fakeStreams[0]!;
    stream.push({ kind: 'close', bar: mockBar(160, 11) });
    stream.push({ kind: 'close', bar: mockBar(220, 12) });
    await new Promise((r) => setTimeout(r, 5));
    const recent = barStore.getRecent({ provider: 'binance', ticker: 'BTC/USDT', interval: '1m' }, 10);
    expect(recent.length).toBeGreaterThanOrEqual(2);
    const times = recent.map((b) => b.time);
    expect(times).toContain(160);
    expect(times).toContain(220);
  });

  test('refcount drops to zero and deactivates the stream after all unsubs', async () => {
    provider.fetchResult = [mockBar(100, 10)];
    const unsub = barStore.subscribe(
      { provider: 'binance', ticker: 'BTC/USDT', interval: '1m' },
      () => {},
    );
    await new Promise((r) => setTimeout(r, 10));
    const stream = fakeStreams[0]!;
    expect(stream.started).toBe(true);
    unsub();
    // idle timeout is 100ms in the test setup
    await new Promise((r) => setTimeout(r, 150));
    expect(stream.stopped).toBe(true);
  });
});
