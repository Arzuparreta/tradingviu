import { useEffect, useRef, useState } from 'react';
import { getToken } from '../api/client';
import type { Quote } from '../api/types';

export type MarketStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'down';

export interface QuoteSymbol {
  readonly id: string;
  readonly exchange: string;
  readonly ticker: string;
}

export interface UseMarketQuotesResult {
  readonly status: MarketStatus;
  /** Keyed by `${exchange}:${ticker}`. */
  readonly quotes: Readonly<Record<string, Quote>>;
}

export const quoteKey = (s: { exchange: string; ticker: string }): string => `${s.exchange}:${s.ticker}`;

/**
 * Live quotes for many symbols over a single WebSocket. The server routes each
 * quote with its `symbol`, and one connection can hold many subscriptions, so a
 * watchlist of N symbols costs one socket, not N.
 */
export const useMarketQuotes = (symbols: readonly QuoteSymbol[]): UseMarketQuotesResult => {
  const [status, setStatus] = useState<MarketStatus>('idle');
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  // Order-independent key so re-renders with a fresh array don't reconnect.
  const subKey = symbols.map(quoteKey).sort().join(',');

  useEffect(() => {
    const wanted = subKey ? subKey.split(',') : [];
    if (wanted.length === 0) {
      setStatus('idle');
      return;
    }
    const token = getToken();
    if (!token) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws?token=${token}&v=1`;
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      setStatus(attempts > 0 ? 'reconnecting' : 'connecting');
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempts = 0;
        setStatus('live');
        for (const symbol of wanted) {
          ws?.send(JSON.stringify({ type: 'subscribe_market', symbol, channels: ['quote'] }));
        }
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; symbol?: string; quote?: Quote };
          if (msg.type === 'quote' && msg.symbol && msg.quote) {
            const sym = msg.symbol;
            const q = msg.quote;
            setQuotes((prev) => ({ ...prev, [sym]: q }));
          }
        } catch {
          void 0;
        }
      };
      ws.onerror = () => setStatus('down');
      ws.onclose = () => {
        if (stopped) return;
        attempts += 1;
        setStatus('reconnecting');
        timer = setTimeout(connect, Math.min(30_000, 500 * 2 ** Math.min(attempts, 6)));
      };
    };

    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (ws) {
        for (const symbol of wanted) {
          try {
            ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
          } catch {
            void 0;
          }
        }
        ws.close();
      }
      setStatus('idle');
    };
  }, [subKey]);

  return { status, quotes };
};
