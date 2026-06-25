import { and, eq, gte, lte, asc, desc } from 'drizzle-orm';
import type { Database } from '@tv/db';
import { bars } from '@tv/db/schema';
import type { Bar } from '@tv/data-types';
import type { Interval } from '@tv/core';
import type { DataProvider } from '@tv/data-adapters';
import { createStream, type Stream, type StreamEvent, type StreamStatus, type StreamKey } from './streams/index.js';
import { PersistQueue, type PersistItem } from './persist-queue.js';

export type { StreamStatus };

export interface BarStreamKey {
  provider: string;
  ticker: string;
  interval: Interval;
}

export type BarEvent =
  | { kind: 'update'; bar: Bar }
  | { kind: 'close'; bar: Bar }
  | { kind: 'status'; status: StreamStatus; message?: string };

export type BarEventHandler = (event: BarEvent) => void;

export interface BarRangeOpts {
  from?: number;
  to?: number;
  limit: number;
}

export interface BarStoreOpts {
  ringSize?: number;
  idleTimeoutMs?: number;
  persistBatchMs?: number;
  systemUserId: string;
  backfillLimit?: number;
  /** Factory for the upstream stream. Defaults to the real Binance/CCXT streams. */
  createStream?: (opts: { key: StreamKey; provider: DataProvider }) => Stream;
}

interface StreamState {
  key: BarStreamKey;
  buffer: Bar[];
  listeners: Set<BarEventHandler>;
  refCount: number;
  status: StreamStatus;
  stream: Stream | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  backfilled: boolean;
  inProgressBar: Bar | null;
  lastError: string | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_RING_SIZE = 5_000;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_PERSIST_BATCH_MS = 100;
const DEFAULT_BACKFILL_LIMIT = 1_000;

const keyStr = (k: BarStreamKey): string => `${k.provider}:${k.ticker}:${k.interval}`;

export class BarStore {
  private streams = new Map<string, StreamState>();
  private persistQueue: PersistQueue;
  private opts: Omit<Required<BarStoreOpts>, 'createStream'> & { systemUserId: string; createStream?: BarStoreOpts['createStream'] };

  constructor(
    private db: Database,
    private getProvider: (id: string) => DataProvider,
    opts: BarStoreOpts,
  ) {
    this.opts = {
      ringSize: opts.ringSize ?? DEFAULT_RING_SIZE,
      idleTimeoutMs: opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      persistBatchMs: opts.persistBatchMs ?? DEFAULT_PERSIST_BATCH_MS,
      backfillLimit: opts.backfillLimit ?? DEFAULT_BACKFILL_LIMIT,
      systemUserId: opts.systemUserId,
    };
    this.persistQueue = new PersistQueue(db, {
      batchMs: this.opts.persistBatchMs,
      systemUserId: this.opts.systemUserId,
    });
    this.persistQueue.start();
    this.createStream = opts.createStream ?? createStream;
  }

  private createStream: (opts: { key: StreamKey; provider: DataProvider }) => Stream;

  /** Subscribe to live + status events for a (provider, ticker, interval). */
  subscribe(key: BarStreamKey, cb: BarEventHandler): () => void {
    const ks = keyStr(key);
    let state = this.streams.get(ks);
    if (!state) {
      state = this.createState(key);
      this.streams.set(ks, state);
    }
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
    state.refCount += 1;
    state.listeners.add(cb);
    // Push current status immediately so the client sees it on connect.
    try {
      cb({ kind: 'status', status: state.status, ...(state.lastError ? { message: state.lastError } : {}) });
    } catch {
      void 0;
    }
    if (state.refCount === 1) {
      void this.activate(state);
    }
    return () => {
      const s = this.streams.get(ks);
      if (!s) return;
      s.listeners.delete(cb);
      s.refCount -= 1;
      if (s.refCount <= 0) {
        s.refCount = 0;
        s.idleTimer = setTimeout(() => this.deactivate(ks), this.opts.idleTimeoutMs);
      }
    };
  }

  /** Last `limit` bars in memory (ASC). Returns [] if stream not active. */
  getRecent(key: BarStreamKey, limit: number): Bar[] {
    const s = this.streams.get(keyStr(key));
    if (!s) return [];
    if (s.buffer.length <= limit) return [...s.buffer];
    return s.buffer.slice(s.buffer.length - limit);
  }

  /**
   * Bars in [from, to] (both inclusive). Memory-first, DB fallback.
   * Returns ASC by time. Capped at `limit`.
   *
   * Includes the in-progress bar (if any) when it falls inside the requested
   * window — the chart needs it on first paint so there's no visual gap
   * between the last closed bar and the live in-progress bar.
   *
   * If the in-memory buffer has ANY bars in the requested window, we return
   * them. Pagination: the caller can re-call with a smaller `before` to get
   * older bars. We only fall back to the DB when the buffer is empty for
   * this key (e.g. cold start, no subscribers).
   */
  async getRange(key: BarStreamKey, rangeOpts: BarRangeOpts): Promise<Bar[]> {
    const s = this.streams.get(keyStr(key));
    if (s && (s.buffer.length > 0 || s.inProgressBar)) {
      const filtered = s.buffer.filter((b) => {
        if (rangeOpts.from !== undefined && b.time < rangeOpts.from) return false;
        if (rangeOpts.to !== undefined && b.time > rangeOpts.to) return false;
        return true;
      });
      // Append the in-progress bar if it's within the window. Its time is
      // always strictly greater than the last closed bar in the buffer, so
      // it lands at the natural end of the series.
      if (s.inProgressBar) {
        const ip = s.inProgressBar;
        const inRange =
          (rangeOpts.from === undefined || ip.time >= rangeOpts.from) &&
          (rangeOpts.to === undefined || ip.time <= rangeOpts.to);
        const duplicate = s.buffer[s.buffer.length - 1]?.time === ip.time;
        if (inRange && !duplicate) {
          filtered.push(ip);
        }
      }
      if (filtered.length > 0) {
        // The buffer is ASC. slice(0, limit) would return the OLDEST N.
        // We want the NEWEST N (= last N), so slice from the end.
        if (filtered.length > rangeOpts.limit) {
          return filtered.slice(filtered.length - rangeOpts.limit);
        }
        return filtered;
      }
    }
    return this.queryDb(key, rangeOpts);
  }

  /** Force a stream to be active. Idempotent. Used by backfill jobs. */
  async ensureStream(key: BarStreamKey): Promise<void> {
    const ks = keyStr(key);
    let state = this.streams.get(ks);
    if (!state) {
      state = this.createState(key);
      this.streams.set(ks, state);
    }
    await this.activate(state);
  }

  /** Drop a stream immediately. */
  evict(key: BarStreamKey): void {
    const ks = keyStr(key);
    const s = this.streams.get(ks);
    if (!s) return;
    this.deactivate(ks);
    this.streams.delete(ks);
  }

  /** Diagnostics for /api/health. */
  stats(): {
    keys: string;
    status: StreamStatus;
    listeners: number;
    buffered: number;
    lastClosedAt: number | null;
  }[] {
    const out: ReturnType<BarStore['stats']> = [];
    for (const [ks, s] of this.streams) {
      out.push({
        keys: ks,
        status: s.status,
        listeners: s.listeners.size,
        buffered: s.buffer.length,
        lastClosedAt: s.buffer.length > 0 ? s.buffer[s.buffer.length - 1]!.time : null,
      });
    }
    return out;
  }

  /** Stop the persist queue (for graceful shutdown). */
  async shutdown(): Promise<void> {
    this.persistQueue.stop();
    for (const ks of [...this.streams.keys()]) {
      this.deactivate(ks);
    }
    await this.persistQueue.flushNow();
  }

  // -------- internals --------

  private createState(key: BarStreamKey): StreamState {
    return {
      key,
      buffer: [],
      listeners: new Set(),
      refCount: 0,
      status: 'idle',
      stream: null,
      idleTimer: null,
      backfilled: false,
      inProgressBar: null,
      lastError: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
    };
  }

  private async activate(state: StreamState): Promise<void> {
    this.setStatus(state, state.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    try {
      if (!state.backfilled) {
        await this.backfill(state);
        state.backfilled = true;
      }
      const provider = this.getProvider(state.key.provider);
      const stream = this.createStream({ key: state.key as StreamKey, provider });
      state.stream = stream;
      stream.start((evt) => this.handleStreamEvent(state, evt));
      this.setStatus(state, 'live');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      state.lastError = msg;
      this.setStatus(state, 'down', msg);
      this.scheduleReconnect(state);
    }
  }

  private deactivate(ks: string): void {
    const state = this.streams.get(ks);
    if (!state) return;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    state.stream?.stop();
    state.stream = null;
    this.setStatus(state, 'idle');
  }

  private scheduleReconnect(state: StreamState): void {
    if (state.idleTimer) return; // stream was abandoned
    state.reconnectAttempts += 1;
    const backoff = Math.min(30_000, 500 * 2 ** Math.min(state.reconnectAttempts, 6));
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      void this.activate(state);
    }, backoff);
  }

  private setStatus(state: StreamState, status: StreamStatus, message?: string): void {
    state.status = status;
    for (const cb of state.listeners) {
      try {
        cb({ kind: 'status', status, ...(message !== undefined ? { message } : {}) });
      } catch {
        void 0;
      }
    }
  }

  private handleStreamEvent(state: StreamState, evt: StreamEvent): void {
    if (evt.kind === 'status') {
      if (evt.status === 'down') state.lastError = evt.message ?? state.lastError;
      if (evt.status === 'live') state.reconnectAttempts = 0;
      this.setStatus(state, evt.status, evt.message);
      return;
    }
    if (evt.kind === 'close') {
      // close: append to buffer, persist
      this.appendBar(state, evt.bar);
      const item: PersistItem = { ...state.key, bar: evt.bar };
      this.persistQueue.enqueue(item);
      this.fanout(state, { kind: 'close', bar: evt.bar });
    } else {
      // update: keep in-progress, do not persist, do not append
      state.inProgressBar = evt.bar;
      this.fanout(state, { kind: 'update', bar: evt.bar });
    }
  }

  private appendBar(state: StreamState, bar: Bar): void {
    const last = state.buffer[state.buffer.length - 1];
    if (last && bar.time <= last.time) {
      // duplicate or out-of-order close — overwrite the last in place.
      // This handles bar corrections from the exchange.
      const i = state.buffer.length - 1;
      state.buffer[i] = bar;
      return;
    }
    state.buffer.push(bar);
    if (state.buffer.length > this.opts.ringSize) {
      state.buffer.splice(0, state.buffer.length - this.opts.ringSize);
    }
  }

  private fanout(state: StreamState, evt: BarEvent): void {
    for (const cb of state.listeners) {
      try {
        cb(evt);
      } catch {
        void 0;
      }
    }
  }

  private async backfill(state: StreamState): Promise<void> {
    const provider = this.getProvider(state.key.provider);
    const fetched = await provider.fetchHistorical({
      symbol: state.key.ticker,
      interval: state.key.interval,
      limit: this.opts.backfillLimit,
    });
    state.buffer = fetched;
    // Persist all backfilled bars (idempotent via ON CONFLICT).
    for (const bar of fetched) {
      this.persistQueue.enqueue({ ...state.key, bar });
    }
  }

  private async queryDb(key: BarStreamKey, rangeOpts: BarRangeOpts): Promise<Bar[]> {
    const conditions = [
      eq(bars.provider, key.provider),
      eq(bars.ticker, key.ticker),
      eq(bars.interval, key.interval),
    ];
    if (rangeOpts.from !== undefined) conditions.push(gte(bars.time, rangeOpts.from));
    if (rangeOpts.to !== undefined) conditions.push(lte(bars.time, rangeOpts.to));
    // Order DESC + limit N + reverse → latest N bars in ASC order. Without
    // the reverse we'd return the OLDEST N bars in the window, which is
    // almost never what a chart wants.
    const rows = await this.db
      .select({
        time: bars.time,
        open: bars.open,
        high: bars.high,
        low: bars.low,
        close: bars.close,
        volume: bars.volume,
      })
      .from(bars)
      .where(and(...conditions))
      .orderBy(desc(bars.time))
      .limit(rangeOpts.limit);
    return rows.reverse();
  }
}
