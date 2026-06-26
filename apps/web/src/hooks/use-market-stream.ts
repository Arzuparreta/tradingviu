import { useEffect, useRef, useState } from 'react';
import { getToken } from '../api/client';
import type { DomBook, Quote } from '../api/types';

export type MarketStatus = 'connecting' | 'live' | 'reconnecting' | 'down' | 'idle';

export interface UseMarketStreamOpts {
  symbolId: string | null;
  exchange: string;
  ticker: string;
  channels?: readonly ('quote' | 'book')[];
}

export interface UseMarketStreamResult {
  status: MarketStatus;
  message: string | null;
  quote: Quote | null;
  book: DomBook | null;
  lastUpdateAt: number | null;
}

export const useMarketStream = (opts: UseMarketStreamOpts): UseMarketStreamResult => {
  const { symbolId, exchange, ticker, channels = ['quote', 'book'] } = opts;
  const [status, setStatus] = useState<MarketStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [book, setBook] = useState<DomBook | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  useEffect(() => {
    if (!symbolId || !exchange || !ticker) return;
    const token = getToken();
    if (!token) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws?token=${token}&v=1`;
    let ws: WebSocket | null = null;
    let stopped = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const symbol = `${exchange}:${ticker}`;

    const connect = () => {
      if (stopped) return;
      setStatus(reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
      ws = new WebSocket(url);
      ws.onopen = () => {
        reconnectAttempts = 0;
        setMessage(null);
        ws?.send(JSON.stringify({ type: 'subscribe_market', symbol, channels: channelsRef.current }));
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; [key: string]: unknown };
          if (msg.type === 'quote' && msg.quote) {
            setQuote(msg.quote as Quote);
            setLastUpdateAt(Date.now());
          } else if (msg.type === 'book' && msg.book) {
            setBook(msg.book as DomBook);
            setLastUpdateAt(Date.now());
          } else if (msg.type === 'market_status') {
            setStatus(msg.status as MarketStatus);
            setMessage((msg.message as string | undefined) ?? null);
          }
        } catch {
          void 0;
        }
      };
      ws.onerror = () => {
        setStatus('down');
        setMessage('market ws error');
      };
      ws.onclose = () => {
        if (stopped) return;
        reconnectAttempts += 1;
        const backoff = Math.min(30_000, 500 * 2 ** Math.min(reconnectAttempts, 6));
        reconnectTimer = setTimeout(connect, backoff);
        setStatus('reconnecting');
      };
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
        } catch {
          void 0;
        }
        ws.close();
      }
      setQuote(null);
      setBook(null);
      setStatus('idle');
      setMessage(null);
      setLastUpdateAt(null);
    };
  }, [symbolId, exchange, ticker, urlKey(channels)]);

  return { status, message, quote, book, lastUpdateAt };
};

const urlKey = (channels: readonly string[]): string => channels.join(',');
