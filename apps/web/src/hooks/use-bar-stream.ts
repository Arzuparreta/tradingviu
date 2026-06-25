import { useEffect, useRef, useState } from 'react';
import { getToken } from '../api/client';
import type { Bar } from '@tv/data-types';
import type { Interval } from '@tv/core';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'down' | 'idle';

export interface UseBarStreamOpts {
  symbolId: string | null;
  exchange: string;
  ticker: string;
  interval: Interval;
  onBar: (bar: Bar, phase: 'update' | 'close') => void;
}

export interface UseBarStreamResult {
  status: StreamStatus;
  message: string | null;
  lastUpdateAt: number | null;
}

const PROTOCOL_VERSION = 1;

export const useBarStream = (opts: UseBarStreamOpts): UseBarStreamResult => {
  const { symbolId, exchange, ticker, interval, onBar } = opts;
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const onBarRef = useRef(onBar);
  onBarRef.current = onBar;

  useEffect(() => {
    if (!symbolId) return;
    const token = getToken();
    if (!token) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws?token=${token}&v=${PROTOCOL_VERSION}`;
    let ws: WebSocket | null = null;
    let stopped = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const subscribeMsg = JSON.stringify({
      type: 'subscribe',
      symbol: `${exchange}:${ticker}`,
      interval,
    });

    const connect = () => {
      if (stopped) return;
      setStatus(reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
      ws = new WebSocket(url);
      ws.onopen = () => {
        reconnectAttempts = 0;
        setStatus('live');
        setMessage(null);
        ws?.send(subscribeMsg);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; [k: string]: unknown };
          if (msg.type === 'bar' && msg.bar) {
            const phase = (msg.phase as 'update' | 'close' | undefined) ?? 'close';
            onBarRef.current(msg.bar as Bar, phase);
            setLastUpdateAt(Date.now());
          } else if (msg.type === 'status') {
            setStatus(msg.status as StreamStatus);
            setMessage((msg.message as string | undefined) ?? null);
          }
        } catch {
          void 0;
        }
      };
      ws.onerror = () => {
        setStatus('down');
        setMessage('ws error');
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
          ws.send(
            JSON.stringify({
              type: 'unsubscribe',
              symbol: `${exchange}:${ticker}`,
            }),
          );
        } catch {
          void 0;
        }
        try {
          ws.close();
        } catch {
          void 0;
        }
      }
    };
  }, [symbolId, exchange, ticker, interval]);

  return { status, message, lastUpdateAt };
};
