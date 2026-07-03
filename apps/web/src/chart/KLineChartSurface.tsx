import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { dispose, init, type Chart, type KLineData } from 'klinecharts';
import type { Interval } from '@tv/layout-sync';
import { api, getToken } from '../api/client';
import type { Bar, Symbol as TvSymbol } from '../api/types';

const WS_PROTOCOL_VERSION = 1;

const barToKLine = (bar: Bar): KLineData => ({
  timestamp: bar.time * 1000,
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume,
});

const wsSymbol = (symbol: TvSymbol): string => `${symbol.exchange}:${symbol.ticker}`;

interface BarMessage {
  type: 'bar';
  symbol: string;
  interval: string;
  bar: Bar;
}

const isBar = (value: unknown): value is Bar => {
  if (typeof value !== 'object' || value == null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.time === 'number' &&
    typeof record.open === 'number' &&
    typeof record.high === 'number' &&
    typeof record.low === 'number' &&
    typeof record.close === 'number' &&
    typeof record.volume === 'number'
  );
};

const isBarMessage = (value: unknown): value is BarMessage => {
  if (typeof value !== 'object' || value == null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === 'bar' &&
    typeof record.symbol === 'string' &&
    typeof record.interval === 'string' &&
    isBar(record.bar)
  );
};

export interface KLineChartSurfaceHandle {
  getChartApi(): Chart | null;
  reload(): void;
}

export interface KLineChartSurfaceProps {
  symbol: TvSymbol;
  interval: Interval;
  live?: boolean;
  onChartReady?: (chart: Chart) => void;
  onDataReady?: (data: KLineData[]) => void;
}

export const KLineChartSurface = forwardRef<KLineChartSurfaceHandle, KLineChartSurfaceProps>(
  function KLineChartSurface({ symbol, interval, live = true, onChartReady, onDataReady }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<Chart | null>(null);
    const loadSeqRef = useRef(0);
    const [reloadSeq, setReloadSeq] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const emitDataReady = useCallback(() => {
      const chart = chartRef.current;
      if (!chart) return;
      onDataReady?.(chart.getDataList());
    }, [onDataReady]);

    useImperativeHandle(
      ref,
      () => ({
        getChartApi: () => chartRef.current,
        reload: () => setReloadSeq((seq) => seq + 1),
      }),
      [],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const chart = init(container, {
        locale: 'en-US',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        styles: 'dark',
      });
      if (!chart) return;

      chartRef.current = chart;
      chart.setPriceVolumePrecision(2, 2);
      chart.setOffsetRightDistance(18);
      chart.createIndicator('MA', false);
      chart.createIndicator('VOL');
      onChartReady?.(chart);

      const resizeObserver = new ResizeObserver(() => chart.resize());
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        dispose(chart);
        chartRef.current = null;
      };
    }, [onChartReady]);

    useEffect(() => {
      const chart = chartRef.current;
      if (!chart) return;

      const controller = new AbortController();
      const seq = ++loadSeqRef.current;
      setLoading(true);
      setError(null);
      chart.clearData();

      api
        .history(symbol.id, interval, 1000, {}, { signal: controller.signal })
        .then((res) => {
          if (controller.signal.aborted || seq !== loadSeqRef.current) return;
          chart.applyNewData(res.bars.map(barToKLine), false, () => {
            if (controller.signal.aborted || seq !== loadSeqRef.current) return;
            chart.scrollToRealTime();
            setLoading(false);
            emitDataReady();
          });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || seq !== loadSeqRef.current) return;
          const message = err instanceof Error ? err.message : 'Unable to load chart data';
          setError(message);
          setLoading(false);
          emitDataReady();
        });

      return () => controller.abort();
    }, [emitDataReady, interval, reloadSeq, symbol.id]);

    useEffect(() => {
      const chart = chartRef.current;
      const token = getToken();
      if (!chart || !live || !token || loading || error) return;

      const targetSymbol = wsSymbol(symbol);
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${token}&v=${WS_PROTOCOL_VERSION}`);
      let closed = false;

      ws.onopen = () => {
        if (!closed) ws.send(JSON.stringify({ type: 'subscribe', symbol: targetSymbol, interval }));
      };
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as unknown;
          if (!isBarMessage(parsed)) return;
          if (parsed.symbol !== targetSymbol || parsed.interval !== interval) return;
          chart.updateData(barToKLine(parsed.bar), emitDataReady);
        } catch {
          return;
        }
      };

      return () => {
        closed = true;
        try {
          ws.send(JSON.stringify({ type: 'unsubscribe', symbol: targetSymbol }));
        } catch {
          return;
        } finally {
          ws.close();
        }
      };
    }, [emitDataReady, error, interval, live, loading, symbol]);

    return (
      <div
        className="kline-core"
        data-symbol={symbol.id}
        data-interval={interval}
        data-loading={loading ? 'true' : 'false'}
      >
        <div ref={containerRef} className="kline-core-canvas" />
        {(loading || error) && (
          <div className="kline-core-status">
            {loading ? 'Loading' : error}
          </div>
        )}
      </div>
    );
  },
);
