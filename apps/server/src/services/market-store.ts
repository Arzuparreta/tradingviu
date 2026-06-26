import { DomBookSchema, type DomBook } from '@tv/core';
import type { Quote } from '@tv/data-types';
import { ccxt } from '@tv/data-adapters';
import { estimateTickSize } from './depth.js';

export type MarketStatus = 'connecting' | 'live' | 'reconnecting' | 'down' | 'idle';
export type MarketChannel = 'quote' | 'book';

export interface MarketKey {
  readonly provider: string;
  readonly ticker: string;
}

export type MarketEvent =
  | { kind: 'quote'; quote: Quote }
  | { kind: 'book'; book: DomBook }
  | { kind: 'status'; status: MarketStatus; message?: string };

type MarketEventHandler = (event: MarketEvent) => void;

interface MarketState {
  readonly key: MarketKey;
  readonly listeners: Set<MarketEventHandler>;
  channels: Set<MarketChannel>;
  status: MarketStatus;
  ws: WebSocket | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  quote: Quote | null;
  book: DomBook | null;
  lastError: string | null;
}

const keyStr = (key: MarketKey): string => `${key.provider}:${key.ticker}`;
const toBinanceSymbol = ccxt.toBinanceSymbol;
const streamSymbol = (ticker: string): string => toBinanceSymbol(ticker).toLowerCase();

const isLevel = (value: unknown): value is [string, string] =>
  Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'string';

const depthLimit = (levels: number): number => {
  if (levels <= 5) return 5;
  if (levels <= 10) return 10;
  if (levels <= 20) return 20;
  if (levels <= 50) return 50;
  if (levels <= 100) return 100;
  if (levels <= 500) return 500;
  if (levels <= 1000) return 1000;
  return 5000;
};

const toSide = (levels: readonly [string, string][], side: 'bid' | 'ask', limit: number) => {
  const sorted = levels
    .map(([price, size]) => ({ price: Number(price), size: Number(size) }))
    .filter((row) => Number.isFinite(row.price) && Number.isFinite(row.size) && row.price > 0 && row.size >= 0)
    .sort((a, b) => (side === 'bid' ? b.price - a.price : a.price - b.price))
    .slice(0, limit);
  let cumulative = 0;
  return sorted.map((row) => {
    cumulative = Number((cumulative + row.size).toFixed(8));
    return { ...row, cumulative };
  });
};

const buildBook = (raw: {
  readonly bids: readonly [string, string][];
  readonly asks: readonly [string, string][];
  readonly levels: number;
  readonly generatedAt?: Date;
}): DomBook | null => {
  const bids = toSide(raw.bids, 'bid', raw.levels);
  const asks = toSide(raw.asks, 'ask', raw.levels);
  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  if (bestBid === undefined || bestAsk === undefined) return null;
  const mid = (bestBid + bestAsk) / 2;
  const bidDepth = bids.at(-1)?.cumulative ?? 0;
  const askDepth = asks.at(-1)?.cumulative ?? 0;
  const imbalance = bidDepth + askDepth === 0 ? 0 : (bidDepth - askDepth) / (bidDepth + askDepth);
  const tickSize = Math.min(
    estimateTickSize(mid),
    Math.abs((bids[0]?.price ?? mid) - (bids[1]?.price ?? mid)) || estimateTickSize(mid),
    Math.abs((asks[1]?.price ?? mid) - (asks[0]?.price ?? mid)) || estimateTickSize(mid),
  );
  return DomBookSchema.parse({
    mid,
    spread: Math.max(0, bestAsk - bestBid),
    tickSize,
    bids,
    asks,
    imbalance,
    generatedAt: raw.generatedAt ?? new Date(),
  });
};

const parseCombinedPayload = (raw: string): unknown => {
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'data' in parsed &&
    typeof (parsed as { data: unknown }).data === 'object'
  ) {
    return (parsed as { data: unknown }).data;
  }
  return parsed;
};

export class MarketStore {
  private states = new Map<string, MarketState>();

  async fetchBookSnapshot(key: MarketKey, levels: number): Promise<DomBook> {
    if (key.provider !== 'binance') {
      throw new Error(`Provider ${key.provider} does not support live depth`);
    }
    const limit = depthLimit(levels);
    const params = new URLSearchParams({ symbol: toBinanceSymbol(key.ticker), limit: String(limit) });
    const res = await fetch(`https://api.binance.com/api/v3/depth?${params.toString()}`);
    if (!res.ok) throw new Error(`Binance depth HTTP ${res.status}`);
    const payload = (await res.json()) as { bids?: unknown[]; asks?: unknown[] };
    const bids = (payload.bids ?? []).filter(isLevel);
    const asks = (payload.asks ?? []).filter(isLevel);
    const book = buildBook({ bids, asks, levels });
    if (!book) throw new Error('Binance depth snapshot had no top of book');
    return book;
  }

  subscribe(key: MarketKey, channels: readonly MarketChannel[], cb: MarketEventHandler): () => void {
    const ks = keyStr(key);
    let state = this.states.get(ks);
    if (!state) {
      state = this.createState(key);
      this.states.set(ks, state);
    }
    for (const channel of channels) state.channels.add(channel);
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
    state.listeners.add(cb);
    cb({ kind: 'status', status: state.status, ...(state.lastError ? { message: state.lastError } : {}) });
    if (state.quote && state.channels.has('quote')) cb({ kind: 'quote', quote: state.quote });
    if (state.book && state.channels.has('book')) cb({ kind: 'book', book: state.book });
    if (!state.ws) this.connect(state);
    return () => {
      const s = this.states.get(ks);
      if (!s) return;
      s.listeners.delete(cb);
      if (s.listeners.size === 0) {
        s.idleTimer = setTimeout(() => this.deactivate(ks), 30_000);
      }
    };
  }

  shutdown(): void {
    for (const ks of [...this.states.keys()]) this.deactivate(ks);
    this.states.clear();
  }

  private createState(key: MarketKey): MarketState {
    return {
      key,
      listeners: new Set(),
      channels: new Set(),
      status: 'idle',
      ws: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      idleTimer: null,
      quote: null,
      book: null,
      lastError: null,
    };
  }

  private setStatus(state: MarketState, status: MarketStatus, message?: string): void {
    state.status = status;
    if (message !== undefined) state.lastError = message;
    this.fanout(state, { kind: 'status', status, ...(message !== undefined ? { message } : {}) });
  }

  private fanout(state: MarketState, event: MarketEvent): void {
    for (const listener of state.listeners) {
      try {
        listener(event);
      } catch {
        void 0;
      }
    }
  }

  private connect(state: MarketState): void {
    if (state.key.provider !== 'binance') {
      this.setStatus(state, 'down', `Provider ${state.key.provider} does not support live market streams`);
      return;
    }
    const streams: string[] = [];
    const sym = streamSymbol(state.key.ticker);
    if (state.channels.has('quote')) streams.push(`${sym}@bookTicker`);
    if (state.channels.has('book')) streams.push(`${sym}@depth20@100ms`);
    if (streams.length === 0) return;
    this.setStatus(state, state.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
    const ws = new WebSocket(url);
    state.ws = ws;
    ws.onopen = () => {
      state.reconnectAttempts = 0;
      state.lastError = null;
      this.setStatus(state, 'live');
    };
    ws.onmessage = (message) => {
      try {
        this.handleMessage(state, typeof message.data === 'string' ? message.data : '');
      } catch {
        void 0;
      }
    };
    ws.onerror = () => this.setStatus(state, 'down', 'market ws error');
    ws.onclose = () => {
      if (state.ws === ws) state.ws = null;
      if (state.listeners.size > 0) this.scheduleReconnect(state);
    };
  }

  private scheduleReconnect(state: MarketState): void {
    if (state.reconnectTimer) return;
    state.reconnectAttempts += 1;
    this.setStatus(state, 'reconnecting');
    const backoff = Math.min(30_000, 500 * 2 ** Math.min(state.reconnectAttempts, 6));
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      this.connect(state);
    }, backoff);
  }

  private handleMessage(state: MarketState, raw: string): void {
    const payload = parseCombinedPayload(raw);
    if (typeof payload !== 'object' || payload === null) return;
    const eventType = (payload as { e?: unknown }).e;
    const maybeTicker = payload as { b?: unknown; B?: unknown; a?: unknown; A?: unknown; E?: unknown };
    if (
      eventType === 'bookTicker' ||
      (
        typeof maybeTicker.b === 'string' &&
        typeof maybeTicker.B === 'string' &&
        typeof maybeTicker.a === 'string' &&
        typeof maybeTicker.A === 'string'
      )
    ) {
      const p = maybeTicker;
      const bid = Number(p.b);
      const ask = Number(p.a);
      const bidSize = Number(p.B);
      const askSize = Number(p.A);
      if (!Number.isFinite(bid) || !Number.isFinite(ask)) return;
      state.quote = {
        time: Math.floor((typeof p.E === 'number' ? p.E : Date.now()) / 1000),
        bid,
        ask,
        ...(Number.isFinite(bidSize) ? { bidSize } : {}),
        ...(Number.isFinite(askSize) ? { askSize } : {}),
      };
      this.fanout(state, { kind: 'quote', quote: state.quote });
      return;
    }
    const bidsRaw = (payload as { bids?: unknown; b?: unknown }).bids ?? (payload as { b?: unknown }).b;
    const asksRaw = (payload as { asks?: unknown; a?: unknown }).asks ?? (payload as { a?: unknown }).a;
    if (Array.isArray(bidsRaw) && Array.isArray(asksRaw)) {
      const bids = bidsRaw.filter(isLevel);
      const asks = asksRaw.filter(isLevel);
      const book = buildBook({ bids, asks, levels: 20 });
      if (!book) return;
      state.book = book;
      this.fanout(state, { kind: 'book', book });
    }
  }

  private deactivate(ks: string): void {
    const state = this.states.get(ks);
    if (!state) return;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
    state.ws?.close();
    state.ws = null;
    state.listeners.clear();
    state.channels.clear();
    this.setStatus(state, 'idle');
  }
}

let marketStore: MarketStore | null = null;

export const getMarketStore = (): MarketStore => {
  marketStore ??= new MarketStore();
  return marketStore;
};

export const shutdownMarketStore = (): void => {
  marketStore?.shutdown();
  marketStore = null;
};
