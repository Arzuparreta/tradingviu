import type { ServerWebSocket } from 'bun';
import { ClientMessageSchema, type ServerMessage } from '@tv/core';
import { getBarStore } from './data.js';
import { normalizeProviderTicker } from './market-data.js';
import { getMarketStore, type MarketChannel } from './market-store.js';

type WsData = { userId?: string; tenantId?: string };
type Ws = ServerWebSocket<WsData>;

interface Subscription {
  provider: string;
  ticker: string;
  interval: string;
  unsubscribe: () => void;
}

interface Connection {
  ws: Ws;
  subscriptions: Map<string, Subscription>;
  marketSubscriptions: Map<string, () => void>;
}

const connections = new Map<Ws, Connection>();

const symbolKey = (provider: string, ticker: string, interval: string): string =>
  `${provider}:${ticker}:${interval}`;

const send = (ws: Ws, message: ServerMessage): void => {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    void 0;
  }
};

const broadcast = (ks: string, message: ServerMessage): void => {
  for (const conn of connections.values()) {
    if (conn.subscriptions.has(ks)) {
      send(conn.ws, message);
    }
  }
};

const parseSymbol = (
  raw: string,
): { provider: string; ticker: string } | undefined => {
  const [exchange, ...rest] = raw.split(':');
  const ticker = rest.join(':');
  if (!exchange || !ticker) return undefined;
  return { provider: exchange.toLowerCase(), ticker: ticker.toUpperCase() };
};

const handleSubscribe = (ws: Ws, msg: { symbol: string; interval: string }): void => {
  const conn = connections.get(ws);
  if (!conn) return;
  const parsed = parseSymbol(msg.symbol);
  if (!parsed) {
    send(ws, { type: 'error', error: 'invalid_symbol' });
    return;
  }
  const ks = symbolKey(parsed.provider, parsed.ticker, msg.interval);
  if (conn.subscriptions.has(ks)) {
    send(ws, { type: 'subscribed', symbol: msg.symbol });
    return;
  }
  const barStore = getBarStore();
  const unsubscribe = barStore.subscribe(
    {
      provider: parsed.provider,
      ticker: normalizeProviderTicker(parsed.provider, parsed.ticker),
      interval: msg.interval as never,
    },
    (event) => {
      if (event.kind === 'status') {
        broadcast(ks, {
          type: 'status',
          symbol: msg.symbol,
          interval: msg.interval as never,
          status: event.status,
          ...(event.message !== undefined ? { message: event.message } : {}),
        });
        return;
      }
      broadcast(ks, {
        type: 'bar',
        symbol: msg.symbol,
        interval: msg.interval as never,
        bar: event.bar,
        phase: event.kind,
      });
    },
  );
  conn.subscriptions.set(ks, {
    provider: parsed.provider,
    ticker: parsed.ticker,
    interval: msg.interval,
    unsubscribe,
  });
  send(ws, { type: 'subscribed', symbol: msg.symbol });
};

const handleMarketSubscribe = (
  ws: Ws,
  msg: { symbol: string; channels: readonly string[] },
): void => {
  const conn = connections.get(ws);
  if (!conn) return;
  const parsed = parseSymbol(msg.symbol);
  if (!parsed) {
    send(ws, { type: 'error', error: 'invalid_symbol' });
    return;
  }
  const ks = `${parsed.provider}:${parsed.ticker}:market`;
  conn.marketSubscriptions.get(ks)?.();
  const channels = msg.channels.filter((channel): channel is MarketChannel =>
    channel === 'quote' || channel === 'book',
  );
  if (channels.length === 0) {
    send(ws, { type: 'error', error: 'invalid_market_channels' });
    return;
  }
  const unsubscribe = getMarketStore().subscribe(
    { provider: parsed.provider, ticker: normalizeProviderTicker(parsed.provider, parsed.ticker) },
    channels,
    (event) => {
      if (event.kind === 'status') {
        send(ws, {
          type: 'market_status',
          symbol: msg.symbol,
          status: event.status,
          ...(event.message !== undefined ? { message: event.message } : {}),
        });
        return;
      }
      if (event.kind === 'quote') {
        send(ws, { type: 'quote', symbol: msg.symbol, quote: event.quote });
        return;
      }
      send(ws, { type: 'book', symbol: msg.symbol, book: event.book });
    },
  );
  conn.marketSubscriptions.set(ks, unsubscribe);
  send(ws, { type: 'subscribed', symbol: msg.symbol });
};

const handleUnsubscribe = (ws: Ws, msg: { symbol: string }): void => {
  const conn = connections.get(ws);
  if (!conn) return;
  const parsed = parseSymbol(msg.symbol);
  if (!parsed) return;
  // unsubscribe from all intervals for that symbol on this connection
  for (const [ks, sub] of conn.subscriptions) {
    if (
      sub.provider === parsed.provider &&
      sub.ticker === parsed.ticker
    ) {
      sub.unsubscribe();
      conn.subscriptions.delete(ks);
    }
  }
  for (const [ks, unsub] of conn.marketSubscriptions) {
    if (ks.startsWith(`${parsed.provider}:${parsed.ticker}:`)) {
      unsub();
      conn.marketSubscriptions.delete(ks);
    }
  }
  send(ws, { type: 'unsubscribed', symbol: msg.symbol });
};

export const wsHandlers = {
  open(ws: Ws): void {
    const conn: Connection = { ws, subscriptions: new Map(), marketSubscriptions: new Map() };
    connections.set(ws, conn);
    send(ws, { type: 'hello', serverTime: Date.now() });
  },
  message(ws: Ws, raw: string | Uint8Array): void {
    let rawMsg: unknown;
    try {
      rawMsg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as unknown;
    } catch {
      send(ws, { type: 'error', error: 'invalid_json' });
      return;
    }
    const parsed = ClientMessageSchema.safeParse(rawMsg);
    if (!parsed.success) {
      send(ws, { type: 'error', error: 'invalid_message' });
      return;
    }
    const msg = parsed.data;
    if (msg.type === 'ping') {
      send(ws, { type: 'pong', t: Date.now() });
      return;
    }
    if (msg.type === 'subscribe') {
      handleSubscribe(ws, msg);
      return;
    }
    if (msg.type === 'subscribe_market') {
      handleMarketSubscribe(ws, msg);
      return;
    }
    if (msg.type === 'unsubscribe') {
      handleUnsubscribe(ws, msg);
      return;
    }
  },
  close(ws: Ws): void {
    const conn = connections.get(ws);
    if (!conn) return;
    for (const sub of conn.subscriptions.values()) {
      sub.unsubscribe();
    }
    for (const unsub of conn.marketSubscriptions.values()) {
      unsub();
    }
    conn.subscriptions.clear();
    conn.marketSubscriptions.clear();
    connections.delete(ws);
  },
};
