import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, getToken } from '../api/client';
import { createTvChart, addSeries, setData, update, removeChart, darkTheme } from '@tv/chart-engine';
import { INTERVALS, type Interval, type Panel } from '@tv/layout-sync';
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';
import { SymbolSearch } from './SymbolSearch';

export interface ChartPanelProps {
  panel: Panel;
  active: boolean;
  live: boolean;
  onActivate: () => void;
  onChange: (patch: Partial<Panel>) => void;
  /** Register the chart + candle series with the parent (for crosshair sync). */
  onReady?: (id: string, chart: IChartApi, series: ISeriesApi<SeriesType>) => void;
  onDestroy?: (id: string) => void;
}

export function ChartPanel({ panel, active, live, onActivate, onChange, onReady, onDestroy }: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const [picking, setPicking] = useState(false);

  const onReadyRef = useRef(onReady);
  const onDestroyRef = useRef(onDestroy);
  onReadyRef.current = onReady;
  onDestroyRef.current = onDestroy;

  const historyQ = useQuery({
    queryKey: ['panel-history', panel.symbolId, panel.interval],
    queryFn: () => api.history(panel.symbolId!, panel.interval, 500),
    enabled: !!panel.symbolId,
    refetchInterval: live ? 30_000 : false,
  });

  // Create the chart once.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createTvChart({ container: containerRef.current, theme: darkTheme, autoSize: true });
    const candle = addSeries(chart, 'candles');
    const volume = addSeries(chart, 'histogram', {
      priceScaleId: '',
      priceFormat: { type: 'volume' },
      color: 'rgba(38, 166, 154, 0.35)',
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;
    onReadyRef.current?.(panel.id, chart, candle);
    return () => {
      onDestroyRef.current?.(panel.id);
      removeChart(chart);
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, [panel.id]);

  // Load history into the series.
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current || !historyQ.data) return;
    setData(
      candleRef.current,
      historyQ.data.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    setData(volumeRef.current, historyQ.data.bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume })));
    chartRef.current?.timeScale().fitContent();
  }, [historyQ.data]);

  // Live bars over WebSocket.
  useEffect(() => {
    if (!live || !panel.symbolId || !historyQ.data) return;
    const token = getToken();
    if (!token) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const sym = `${historyQ.data.symbol.exchange}:${historyQ.data.symbol.ticker}`;
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${token}`);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', symbol: sym, interval: panel.interval }));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'bar' && candleRef.current && volumeRef.current) {
          update(candleRef.current, {
            time: msg.bar.time as UTCTimestamp,
            open: msg.bar.open,
            high: msg.bar.high,
            low: msg.bar.low,
            close: msg.bar.close,
          });
          update(volumeRef.current, { time: msg.bar.time as UTCTimestamp, value: msg.bar.volume });
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => ws.close();
  }, [live, panel.symbolId, panel.interval, historyQ.data?.symbol.exchange, historyQ.data?.symbol.ticker]);

  const sym = historyQ.data?.symbol;
  const showPicker = picking || !panel.symbolId;

  return (
    <div className={`chart-panel${active ? ' active' : ''}`} onMouseDown={onActivate}>
      <div className="chart-panel-head">
        {showPicker ? (
          <div onMouseDown={(e) => e.stopPropagation()} style={{ flex: 1 }}>
            <SymbolSearch
              autoFocus
              placeholder="Pick symbol…"
              onSelect={(s) => {
                onChange({ symbolId: s.id });
                setPicking(false);
              }}
            />
          </div>
        ) : (
          <button className="ghost chart-panel-sym" onMouseDown={(e) => { e.stopPropagation(); onActivate(); setPicking(true); }}>
            <span className="mono">{sym ? `${sym.exchange}:${sym.ticker}` : panel.symbolId}</span>
          </button>
        )}
        <select
          value={panel.interval}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ interval: e.target.value as Interval })}
          style={{ width: 64 }}
        >
          {INTERVALS.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </div>
      <div ref={containerRef} className="chart-panel-canvas" />
      {panel.symbolId && historyQ.isLoading && <div className="chart-panel-loading muted small">loading…</div>}
    </div>
  );
}
