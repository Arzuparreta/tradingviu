import { sql, and, eq, gte, lte, asc } from 'drizzle-orm';
import { bars } from '@tv/db/schema';
import { type Database } from '@tv/db';
import type { Bar } from '@tv/data-types';
import type { Interval } from '@tv/core';

export interface PersistItem {
  provider: string;
  ticker: string;
  interval: Interval;
  bar: Bar;
}

export interface PersistQueueOpts {
  batchMs: number;
  systemUserId: string;
  maxBatch?: number;
}

export class PersistQueue {
  private queue: PersistItem[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private stopped = false;

  constructor(
    private db: Database,
    private opts: PersistQueueOpts,
  ) {}

  start(): void {
    void 0;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  enqueue(item: PersistItem): void {
    if (this.stopped) return;
    this.queue.push(item);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.opts.batchMs);
  }

  async flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const max = this.opts.maxBatch ?? 500;
        const batch = this.queue.splice(0, Math.min(this.queue.length, max));
        if (batch.length === 0) break;
        try {
          await this.writeBatch(batch);
        } catch (e) {
          console.error('[persist-queue] flush failed', e);
          // Re-queue at the head so the next attempt re-tries. The exchange
          // will continue to send the same bar on correction, so this is safe.
          this.queue.unshift(...batch);
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async writeBatch(batch: PersistItem[]): Promise<void> {
    if (batch.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const item of batch) {
        await tx
          .insert(bars)
          .values({
            provider: item.provider,
            ticker: item.ticker,
            interval: item.interval,
            time: item.bar.time,
            open: item.bar.open,
            high: item.bar.high,
            low: item.bar.low,
            close: item.bar.close,
            volume: item.bar.volume,
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
      }
    });
  }
}

export { and, eq, gte, lte, asc };
