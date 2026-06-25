import type { Bar } from '@tv/data-types';
import type { Stream, StreamEvent, StreamEventHandler, StreamKey } from './types.js';

const SUPPORTED: ReadonlySet<string> = new Set([
  '1s', '5s', '15s', '30s',
  '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '12h',
  '1d', '3d', '1w', '1M',
]);

const symbolToStream = (ticker: string): string => ticker.replace('/', '').toLowerCase();

export const createBinanceStream = (key: StreamKey): Stream => {
  if (!SUPPORTED.has(key.interval)) {
    throw new Error(`Binance stream: interval ${key.interval} not supported`);
  }
  const url = `wss://stream.binance.com:9443/ws/${symbolToStream(key.ticker)}@kline_${key.interval}`;

  let ws: WebSocket | null = null;
  let onEvent: StreamEventHandler | null = null;
  let stopped = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleReconnect = (): void => {
    if (stopped) return;
    reconnectAttempts += 1;
    const backoff = Math.min(30_000, 500 * 2 ** Math.min(reconnectAttempts, 6));
    reconnectTimer = setTimeout(connect, backoff);
    onEvent?.({ kind: 'status', status: 'reconnecting' });
  };

  const connect = (): void => {
    if (stopped) return;
    onEvent?.({
      kind: 'status',
      status: reconnectAttempts > 0 ? 'reconnecting' : 'connecting',
    });
    ws = new WebSocket(url);
    ws.onopen = () => {
      reconnectAttempts = 0;
      onEvent?.({ kind: 'status', status: 'live' });
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(typeof e.data === 'string' ? e.data : '') as {
          k?: {
            t?: number;
            o?: string;
            h?: string;
            l?: string;
            c?: string;
            v?: string;
            x?: boolean;
          };
        };
        const k = msg.k;
        if (!k || k.t === undefined || k.o === undefined || k.h === undefined || k.l === undefined || k.c === undefined) {
          return;
        }
        const open = parseFloat(k.o);
        const high = parseFloat(k.h);
        const low = parseFloat(k.l);
        const close = parseFloat(k.c);
        if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
          return;
        }
        const bar: Bar = {
          time: Math.floor(k.t / 1000),
          open,
          high,
          low,
          close,
          volume: k.v ? parseFloat(k.v) : 0,
        };
        if (k.x) {
          onEvent?.({ kind: 'close', bar });
        } else {
          onEvent?.({ kind: 'update', bar });
        }
      } catch {
        void 0;
      }
    };
    ws.onerror = () => {
      onEvent?.({ kind: 'status', status: 'down', message: 'ws error' });
    };
    ws.onclose = () => {
      ws = null;
      scheduleReconnect();
    };
  };

  return {
    start(cb) {
      onEvent = cb;
      connect();
    },
    stop() {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        try {
          ws.close();
        } catch {
          void 0;
        }
        ws = null;
      }
    },
  };
};
