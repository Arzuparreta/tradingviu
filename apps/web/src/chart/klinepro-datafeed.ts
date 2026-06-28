import type { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback } from '@klinecharts/pro';
import type { KLineData } from 'klinecharts';
import { api, getToken } from '../api/client';
import type { Bar } from '@tv/data-types';

/**
 * Datafeed adapter wiring KLineChart Pro to our existing market-data API:
 *   - searchSymbols      -> GET /api/symbols
 *   - getHistoryKLineData-> GET /api/chart/history
 *   - subscribe/unsubscribe -> the /ws live bar stream (same protocol as useBarStream)
 *
 * SymbolInfo carries our internal symbol id + exchange:ticker key via extra fields
 * so history (by id) and the WS (by exchange:ticker) both have what they need.
 */
export interface TvSymbolInfo extends SymbolInfo {
  /** Our internal symbol id (ULID) — used by /api/chart/history. */
  id: string;
}

const WS_PROTOCOL_VERSION = 1;

/** Map a KLineChart Pro Period to our interval string (e.g. {1,'minute'} -> '1m'). */
export const periodToInterval = (period: Period): string => {
  const unit: Record<string, string> = {
    minute: 'm',
    hour: 'h',
    day: 'd',
    week: 'w',
    month: 'M',
  };
  const suffix = unit[period.timespan] ?? 'm';
  return `${period.multiplier}${suffix}`;
};

const barToKLine = (bar: Bar): KLineData => ({
  timestamp: bar.time * 1000,
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume,
});

const symbolKey = (symbol: SymbolInfo): string => {
  const s = symbol as TvSymbolInfo;
  return s.id || symbol.ticker;
};

const wsSymbol = (symbol: SymbolInfo): string => `${symbol.exchange ?? ''}:${symbol.ticker}`;

interface LiveSocket {
  ws: WebSocket;
  stopped: boolean;
}

export class TradingviuDatafeed implements Datafeed {
  private sockets = new Map<string, LiveSocket>();

  async searchSymbols(search?: string): Promise<SymbolInfo[]> {
    const res = await api.symbols(search ?? '');
    return res.results.map(
      (r): TvSymbolInfo => ({
        id: r.id,
        ticker: r.ticker,
        name: r.name,
        exchange: r.exchange,
        priceCurrency: r.currency,
        type: r.assetClass,
      }),
    );
  }

  async getHistoryKLineData(
    symbol: SymbolInfo,
    period: Period,
    from: number,
    to: number,
  ): Promise<KLineData[]> {
    const interval = periodToInterval(period);
    const res = await api.history(symbolKey(symbol), interval, 1000);
    return res.bars
      .map(barToKLine)
      .filter((k) => k.timestamp >= from && k.timestamp <= to);
  }

  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    const token = getToken();
    if (!token) return;
    const key = `${wsSymbol(symbol)}|${periodToInterval(period)}`;
    this.unsubscribe(symbol, period);

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws?token=${token}&v=${WS_PROTOCOL_VERSION}`;
    const live: LiveSocket = { ws: new WebSocket(url), stopped: false };
    const interval = periodToInterval(period);

    live.ws.onopen = () => {
      live.ws.send(JSON.stringify({ type: 'subscribe', symbol: wsSymbol(symbol), interval }));
    };
    live.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; bar?: Bar };
        if (msg.type === 'bar' && msg.bar) callback(barToKLine(msg.bar));
      } catch {
        void 0;
      }
    };
    this.sockets.set(key, live);
  }

  unsubscribe(symbol: SymbolInfo, period: Period): void {
    const key = `${wsSymbol(symbol)}|${periodToInterval(period)}`;
    const live = this.sockets.get(key);
    if (!live) return;
    live.stopped = true;
    try {
      live.ws.send(JSON.stringify({ type: 'unsubscribe', symbol: wsSymbol(symbol) }));
    } catch {
      void 0;
    }
    try {
      live.ws.close();
    } catch {
      void 0;
    }
    this.sockets.delete(key);
  }
}
