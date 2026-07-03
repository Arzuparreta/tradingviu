import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { dispose, init, type Chart, type KLineData } from 'klinecharts';
import type { ChartType, Interval } from '@tv/layout-sync';
import { api, getToken } from '../api/client';
import type { Bar, Symbol as TvSymbol } from '../api/types';
import { buildChartStyles, inferPrecision, type ChartSettings } from './theme';
import { registerChartOverlays } from './overlays';
import { INDICATOR_MAP } from './indicators';

registerChartOverlays();

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
  chartType: ChartType;
  settings: ChartSettings;
  /** Indicator ids from the panel config (catalog decides main vs sub pane). */
  indicators: readonly string[];
  live?: boolean;
  onChartReady?: (chart: Chart) => void;
  onDataReady?: (data: KLineData[]) => void;
  onAppliedKeyChange?: (key: string) => void;
}

interface ChartDebugState {
  currentSymbol: string;
  currentInterval: string;
  loading: boolean;
  lastAppliedKey: string | null;
  barCount: number;
}

declare global {
  interface Window {
    __TV_E2E_CHARTS__?: Record<string, ChartDebugState>;
  }
}

export const KLineChartSurface = forwardRef<KLineChartSurfaceHandle, KLineChartSurfaceProps>(
  function KLineChartSurface(
    {
      symbol,
      interval,
      chartType,
      settings,
      indicators,
      live = true,
      onChartReady,
      onDataReady,
      onAppliedKeyChange,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<Chart | null>(null);
    // Sub-pane indicators keep their pane ids so removal targets the right pane.
    const subPanesRef = useRef<Map<string, string>>(new Map());
    const mainIndicatorsRef = useRef<Set<string>>(new Set());
    const [reloadSeq, setReloadSeq] = useState(0);
    const [lastAppliedKey, setLastAppliedKey] = useState<string | null>(null);
    const currentKey = `${symbol.id}|${interval}|${reloadSeq}`;
    const dataQ = useQuery({
      queryKey: ['chart-bars', symbol.id, interval, reloadSeq],
      queryFn: ({ signal }) => api.history(symbol.id, interval, 1000, {}, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 2_500,
      refetchOnWindowFocus: false,
    });
    const loading = dataQ.isPending || (dataQ.isFetching && lastAppliedKey !== currentKey);
    const error = dataQ.error instanceof Error ? dataQ.error.message : null;

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
      });
      if (!chart) return;

      chartRef.current = chart;
      chart.setOffsetRightDistance(72);
      onChartReady?.(chart);

      const resizeObserver = new ResizeObserver(() => chart.resize());
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        dispose(chart);
        chartRef.current = null;
        subPanesRef.current.clear();
        mainIndicatorsRef.current.clear();
      };
    }, [onChartReady]);

    // Theme + chart type + axis/grid settings.
    useEffect(() => {
      chartRef.current?.setStyles(buildChartStyles(chartType, settings));
    }, [chartType, settings]);

    // Reconcile the indicator set with what's on the chart.
    const indicatorKey = indicators.join(',');
    useEffect(() => {
      const chart = chartRef.current;
      if (!chart) return;
      const wanted = indicatorKey === '' ? [] : indicatorKey.split(',');
      const wantedMain = new Set(wanted.filter((id) => INDICATOR_MAP[id]?.pane === 'main'));
      const wantedSub = new Set(wanted.filter((id) => INDICATOR_MAP[id]?.pane === 'sub'));

      for (const id of [...mainIndicatorsRef.current]) {
        if (!wantedMain.has(id)) {
          chart.removeIndicator('candle_pane', id);
          mainIndicatorsRef.current.delete(id);
        }
      }
      for (const [id, paneId] of [...subPanesRef.current]) {
        if (!wantedSub.has(id)) {
          chart.removeIndicator(paneId, id);
          subPanesRef.current.delete(id);
        }
      }
      // VOL ships MA(5,10,20) overlays by default — plain volume bars read better.
      const create = (id: string) => (id === 'VOL' ? { name: 'VOL', calcParams: [] } : id);
      for (const id of wantedMain) {
        if (!mainIndicatorsRef.current.has(id)) {
          chart.createIndicator(create(id), true, { id: 'candle_pane' });
          mainIndicatorsRef.current.add(id);
        }
      }
      for (const id of wantedSub) {
        if (!subPanesRef.current.has(id)) {
          const paneId = chart.createIndicator(create(id), false, { height: 80 });
          if (paneId) subPanesRef.current.set(id, paneId);
        }
      }
    }, [indicatorKey]);

    useEffect(() => {
      const chart = chartRef.current;
      if (!chart || !dataQ.data || dataQ.isPlaceholderData) return;

      const bars = dataQ.data.bars;
      chart.setPriceVolumePrecision(inferPrecision(bars.map((b) => b.close)), 0);

      const applyKey = currentKey;
      chart.applyNewData(bars.map(barToKLine), false, () => {
        chart.scrollToRealTime();
        setLastAppliedKey(applyKey);
        onAppliedKeyChange?.(applyKey);
        emitDataReady();
      });
    }, [currentKey, dataQ.data, dataQ.isPlaceholderData, emitDataReady, onAppliedKeyChange]);

    useEffect(() => {
      if (!import.meta.env.VITE_E2E) return;
      const chart = chartRef.current;
      window.__TV_E2E_CHARTS__ = {
        ...(window.__TV_E2E_CHARTS__ ?? {}),
        [symbol.id]: {
          currentSymbol: symbol.id,
          currentInterval: interval,
          loading,
          lastAppliedKey,
          barCount: chart?.getDataList().length ?? 0,
        },
      };
    }, [interval, lastAppliedKey, loading, symbol.id]);

    useEffect(() => {
      const chart = chartRef.current;
      const token = getToken();
      if (!chart || !live || !token || lastAppliedKey !== currentKey || error) return;

      const targetSymbol = wsSymbol(symbol);
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(
        `${proto}://${window.location.host}/ws?token=${token}&v=${WS_PROTOCOL_VERSION}`,
      );
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
    }, [currentKey, emitDataReady, error, interval, lastAppliedKey, live, symbol]);

    return (
      <div
        className="kline-core"
        data-symbol={symbol.id}
        data-interval={interval}
        data-loading={loading ? 'true' : 'false'}
      >
        <div ref={containerRef} className="kline-core-canvas" />
        {(loading || error) && (
          <div className="kline-core-status">{loading ? 'Loading' : error}</div>
        )}
      </div>
    );
  },
);
