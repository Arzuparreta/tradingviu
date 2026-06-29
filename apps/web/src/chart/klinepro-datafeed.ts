import type { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback } from '@klinecharts/pro';
import type { KLineData } from 'klinecharts';
import { api, getToken } from '../api/client';
import type { Bar } from '@tv/data-types';

export interface TvSymbolInfo extends SymbolInfo {
  id: string;
}

export interface DatafeedCallbacks {
  onSymbolPeriodChange?: (symbol: SymbolInfo, period: Period) => void;
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

/** Map an interval string to a KLineChart Pro Period (reverse of periodToInterval). */
export const intervalToPeriod = (interval: string): Period => {
  const map: Record<string, Period> = {
    '1m': { multiplier: 1, timespan: 'minute', text: '1m' },
    '5m': { multiplier: 5, timespan: 'minute', text: '5m' },
    '15m': { multiplier: 15, timespan: 'minute', text: '15m' },
    '30m': { multiplier: 30, timespan: 'minute', text: '30m' },
    '1h': { multiplier: 1, timespan: 'hour', text: '1H' },
    '4h': { multiplier: 4, timespan: 'hour', text: '4H' },
    '1d': { multiplier: 1, timespan: 'day', text: '1D' },
    '1w': { multiplier: 1, timespan: 'week', text: '1W' },
  };
  return map[interval] ?? { multiplier: 1, timespan: 'day', text: '1D' };
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
  callbacks: DatafeedCallbacks;
  private _maxTimestamp: number | null = null;

  constructor(callbacks: DatafeedCallbacks = {}) {
    this.callbacks = callbacks;
  }

  setMaxTimestamp(ts: number | null): void {
    this._maxTimestamp = ts;
  }

  reset(): void {
    for (const [key, live] of this.sockets) {
      live.stopped = true;
      try { live.ws.close(); } catch { void 0; }
      this.sockets.delete(key);
    }
  }

  async searchSymbols(search?: string): Promise<SymbolInfo[]> {
    const query = search?.trim() ?? '';
    const res = query ? await api.symbols(query) : await api.allSymbols();
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
    this.callbacks.onSymbolPeriodChange?.(symbol, period);
    const interval = periodToInterval(period);
    const res = await api.history(symbolKey(symbol), interval, 1000, { from, to });
    let bars = res.bars.map(barToKLine);
    if (this._maxTimestamp != null) {
      bars = bars.filter((k) => k.timestamp <= this._maxTimestamp!);
    }
    return bars;
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
