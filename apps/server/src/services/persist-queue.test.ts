import { describe, expect, test, beforeEach } from 'bun:test';
import { PersistQueue } from './persist-queue.js';
import type { Bar } from '@tv/data-types';

const makeBar = (time: number): Bar => ({
  time,
  open: 1,
  high: 2,
  low: 0.5,
  close: 1.5,
  volume: 10,
});

interface FakeInsertCall {
  provider: string;
  ticker: string;
  interval: string;
  time: number;
}

const makeStubDb = (): {
  transaction: (cb: (tx: never) => Promise<void>) => Promise<void>;
  insertCalls: FakeInsertCall[];
} => {
  const insertCalls: FakeInsertCall[] = [];
  return {
    insertCalls,
    transaction: async (cb) => {
      const tx = {
        insert: (table: {
          provider: unknown;
          ticker: unknown;
          interval: unknown;
          time: unknown;
        }) => ({
          values: (v: { provider: string; ticker: string; interval: string; time: number }) => ({
            onConflictDoUpdate: () => {
              insertCalls.push(v);
              return Promise.resolve();
            },
          }),
        }),
        execute: () => Promise.resolve(),
      } as never;
      await cb(tx);
    },
  };
};

describe('PersistQueue', () => {
  let db: ReturnType<typeof makeStubDb>;
  let queue: PersistQueue;

  beforeEach(() => {
    db = makeStubDb();
    queue = new PersistQueue(db as never, { batchMs: 10, systemUserId: 'test' });
    queue.start();
  });

  test('enqueue schedules a batched flush', async () => {
    queue.enqueue({ provider: 'binance', ticker: 'BTC/USDT', interval: '1m', bar: makeBar(100) });
    queue.enqueue({ provider: 'binance', ticker: 'BTC/USDT', interval: '1m', bar: makeBar(160) });
    await new Promise((r) => setTimeout(r, 30));
    expect(db.insertCalls.length).toBe(2);
  });

  test('flushNow drains the queue immediately', async () => {
    queue.enqueue({ provider: 'binance', ticker: 'BTC/USDT', interval: '1m', bar: makeBar(100) });
    await queue.flushNow();
    expect(db.insertCalls.length).toBe(1);
  });

  test('failed batch re-queues the items for the next attempt', async () => {
    let attempts = 0;
    const failingDb = {
      transaction: async (cb: (tx: never) => Promise<void>) => {
        attempts += 1;
        if (attempts === 1) throw new Error('boom');
        // 2nd attempt: succeed
        const tx = {
          execute: () => Promise.resolve(),
          insert: () => ({
            values: (v: { provider: string; ticker: string; interval: string; time: number }) => ({
              onConflictDoUpdate: () => {
                db.insertCalls.push(v);
                return Promise.resolve();
              },
            }),
          }),
        } as never;
        await cb(tx);
      },
    };
    const q2 = new PersistQueue(failingDb as never, { batchMs: 5, systemUserId: 'test' });
    q2.start();
    q2.enqueue({ provider: 'binance', ticker: 'BTC/USDT', interval: '1m', bar: makeBar(100) });
    // First attempt fails after the batch window; batch is re-queued.
    const originalError = console.error;
    console.error = () => undefined;
    try {
      await new Promise((r) => setTimeout(r, 20));
      expect(attempts).toBe(1);
      // Manually trigger another flush — should succeed.
      await q2.flushNow();
    } finally {
      console.error = originalError;
    }
    expect(attempts).toBe(2);
    expect(db.insertCalls).toHaveLength(1);
    expect(db.insertCalls[0]).toMatchObject({
      provider: 'binance',
      ticker: 'BTC/USDT',
      interval: '1m',
      time: 100,
    });
  });

  test('stop() drops new enqueues', async () => {
    queue.stop();
    queue.enqueue({ provider: 'binance', ticker: 'BTC/USDT', interval: '1m', bar: makeBar(100) });
    await new Promise((r) => setTimeout(r, 20));
    expect(db.insertCalls.length).toBe(0);
  });
});
