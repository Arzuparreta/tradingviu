import type { ServerWebSocket } from 'bun';
import { ClientMessageSchema, type ServerMessage } from '@tv/core';
import { getProvider, initDataProviders } from './data.js';

initDataProviders();

type WsData = unknown;
type Ws = ServerWebSocket<WsData>;

interface Connection {
  ws: Ws;
  subscriptions: Map<string, { exchange: string; ticker: string; interval: string; unsub?: () => void }>;
}

const connections = new Map<Ws, Connection>();

const broadcast = (symbolKey: string, message: ServerMessage): void => {
  for (const conn of connections.values()) {
    if (conn.subscriptions.has(symbolKey)) {
      conn.ws.send(JSON.stringify(message));
    }
  }
};

const parseSymbolKey = (exchange: string, ticker: string): string =>
  `${exchange}:${ticker}`;

export const wsHandlers = {
  open(ws: Ws): void {
    const conn: Connection = { ws, subscriptions: new Map() };
    connections.set(ws, conn);
    ws.send(JSON.stringify({ type: 'hello', serverTime: Date.now() } satisfies ServerMessage));
  },
  message(ws: Ws, raw: string | Uint8Array): void {
    let rawMsg: unknown;
    try {
      rawMsg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as unknown;
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'invalid_json' } satisfies ServerMessage));
      return;
    }
    const parsed = ClientMessageSchema.safeParse(rawMsg);
    if (!parsed.success) {
      ws.send(JSON.stringify({ type: 'error', error: 'invalid_message' } satisfies ServerMessage));
      return;
    }
    const msg = parsed.data;
    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', t: Date.now() } satisfies ServerMessage));
      return;
    }
    if (msg.type === 'subscribe') {
      const conn = connections.get(ws);
      if (!conn) return;
      const [exchange, ticker] = msg.symbol.split(':');
      if (!exchange || !ticker) {
        ws.send(JSON.stringify({ type: 'error', error: 'invalid_symbol' } satisfies ServerMessage));
        return;
      }
      const providerId = exchange.toLowerCase();
      const symbolKey = parseSymbolKey(exchange.toUpperCase(), ticker.toUpperCase());
      if (conn.subscriptions.has(symbolKey)) {
        ws.send(JSON.stringify({ type: 'subscribed', symbol: msg.symbol } satisfies ServerMessage));
        return;
      }
      const provider = getProvider(providerId);
      if (!provider.subscribe) {
        ws.send(JSON.stringify({ type: 'error', error: 'no_ws_support' } satisfies ServerMessage));
        return;
      }
      const meta: { exchange: string; ticker: string; interval: string; unsub?: () => void } = {
        exchange: exchange.toUpperCase(),
        ticker: ticker.toUpperCase(),
        interval: msg.interval,
      };
      conn.subscriptions.set(symbolKey, meta);
      meta.unsub = provider.subscribe(
        { id: symbolKey, exchange: meta.exchange, ticker: meta.ticker, name: meta.ticker, assetClass: 'crypto', currency: 'USD', active: true, metadata: {} },
        (bar) => {
          broadcast(symbolKey, { type: 'bar', symbol: msg.symbol, interval: msg.interval, bar });
        },
        msg.interval,
      );
      ws.send(JSON.stringify({ type: 'subscribed', symbol: msg.symbol } satisfies ServerMessage));
    }
    if (msg.type === 'unsubscribe') {
      const conn = connections.get(ws);
      if (!conn) return;
      const [exchange, ticker] = msg.symbol.split(':');
      if (!exchange || !ticker) return;
      const symbolKey = parseSymbolKey(exchange.toUpperCase(), ticker.toUpperCase());
      const meta = conn.subscriptions.get(symbolKey);
      if (meta?.unsub) meta.unsub();
      conn.subscriptions.delete(symbolKey);
      ws.send(JSON.stringify({ type: 'unsubscribed', symbol: msg.symbol } satisfies ServerMessage));
    }
  },
  close(ws: Ws): void {
    const conn = connections.get(ws);
    if (!conn) return;
    for (const meta of conn.subscriptions.values()) {
      meta.unsub?.();
    }
    connections.delete(ws);
  },
};
