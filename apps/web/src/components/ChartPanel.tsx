import { useEffect, useMemo, useRef, useState } from 'react';
import { createTvChart, addSeries, setData, removeChart, darkTheme } from '@tv/chart-engine';
import { INTERVALS, type Interval, type Panel } from '@tv/layout-sync';
import type { Drawing, DrawingStyle, DrawingTool } from '@tv/drawing-tools';
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';
import { SymbolSearch } from './SymbolSearch';
import { DrawingOverlay } from './DrawingOverlay';
import { useChartHistory } from '../hooks/use-chart-history';
import { useBarStream } from '../hooks/use-bar-stream';

/** The loaded time span of a panel's bars, reported up for multi-chart replay. */
export interface PanelBounds {
  min: number;
  max: number;
  step: number;
}

export interface ChartPanelProps {
  panel: Panel;
  active: boolean;
  live: boolean;
  onActivate: () => void;
  onChange: (patch: Partial<Panel>) => void;
  drawingTool: DrawingTool;
  drawingStyle: DrawingStyle;
  deleteDrawingRequest: number;
  /** Register the chart + candle series with the parent (for crosshair sync). */
  onReady?: (id: string, chart: IChartApi, series: ISeriesApi<SeriesType>) => void;
  onDestroy?: (id: string) => void;
  /** When true, the panel reveals only bars up to `replayCursor` (time). */
  replayActive?: boolean;
  /** Shared replay cursor time (UTC seconds), or null when not replaying. */
  replayCursor?: number | null;
  /** Report this panel's loaded time bounds (or null) for the global domain. */
  onBounds?: (id: string, bounds: PanelBounds | null) => void;
}

export function ChartPanel({
  panel,
  active,
  live,
  onActivate,
  onChange,
  drawingTool,
  drawingStyle,
  deleteDrawingRequest,
  onReady,
  onDestroy,
  replayActive = false,
  replayCursor = null,
  onBounds,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const [candleApi, setCandleApi] = useState<ISeriesApi<SeriesType> | null>(null);
  const [picking, setPicking] = useState(false);

  const onReadyRef = useRef(onReady);
  const onDestroyRef = useRef(onDestroy);
  const onBoundsRef = useRef(onBounds);
  onReadyRef.current = onReady;
  onDestroyRef.current = onDestroy;
  onBoundsRef.current = onBounds;

  const historyQ = useChartHistory({
    symbolId: panel.symbolId ?? null,
    interval: panel.interval,
    pageSize: 500,
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
    setChartApi(chart);
    setCandleApi(candle);
    onReadyRef.current?.(panel.id, chart, candle);
    return () => {
      onDestroyRef.current?.(panel.id);
      removeChart(chart);
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      setChartApi(null);
      setCandleApi(null);
    };
  }, [panel.id]);

  // Bars actually drawn: the full history, or clipped to the shared replay
  // cursor time so every panel reveals the same point in time together.
  const renderBars = useMemo(() => {
    const bars = historyQ.bars;
    if (replayActive && replayCursor != null) return bars.filter((b) => b.time <= replayCursor);
    return bars;
  }, [historyQ.bars, replayActive, replayCursor]);

  // Re-fit the view when the symbol/interval changes (not on every replay step).
  const firstFitRef = useRef(true);
  useEffect(() => {
    firstFitRef.current = true;
  }, [panel.symbolId, panel.interval]);

  // Render bars into the series.
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;
    setData(
      candleRef.current,
      renderBars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    setData(volumeRef.current, renderBars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume })));
    if (firstFitRef.current && renderBars.length > 0) {
      chartRef.current?.timeScale().fitContent();
      firstFitRef.current = false;
    } else if (replayActive) {
      chartRef.current?.timeScale().scrollToRealTime();
    }
  }, [renderBars, replayActive]);

  // Report this panel's loaded time bounds for the parent's global replay domain.
  useEffect(() => {
    const bars = historyQ.bars;
    if (!bars || bars.length === 0) {
      onBoundsRef.current?.(panel.id, null);
      return;
    }
    const min = bars[0]!.time;
    const max = bars[bars.length - 1]!.time;
    let step = Infinity;
    for (let i = 1; i < bars.length; i++) {
      const d = bars[i]!.time - bars[i - 1]!.time;
      if (d > 0 && d < step) step = d;
    }
    onBoundsRef.current?.(panel.id, { min, max, step: Number.isFinite(step) ? step : 60 });
  }, [historyQ.bars, panel.id]);

  const historyQRef = useRef(historyQ);
  historyQRef.current = historyQ;
  useBarStream({
    symbolId: live && !replayActive && panel.symbolId && historyQ.symbol ? panel.symbolId : null,
    exchange: historyQ.symbol?.exchange ?? '',
    ticker: historyQ.symbol?.ticker ?? '',
    interval: panel.interval,
    onBar: (bar) => historyQRef.current.upsertBar(bar),
  });

  const sym = historyQ.symbol;
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
      <div className="chart-panel-chart">
        <div ref={containerRef} className="chart-panel-canvas" />
        <DrawingOverlay
          chart={chartApi}
          series={candleApi}
          drawings={panel.drawings}
          tool={drawingTool}
          style={drawingStyle}
          active={active}
          deleteRequest={deleteDrawingRequest}
          onChange={(drawings: Drawing[]) => onChange({ drawings })}
        />
      </div>
      {panel.symbolId && historyQ.isLoading && <div className="chart-panel-loading muted small">loading…</div>}
    </div>
  );
}
