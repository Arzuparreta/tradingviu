import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';
import { createTvChart, addSeries, setData, removeChart, darkTheme } from '@tv/chart-engine';
import type { ChartTheme } from '@tv/chart-engine';

// ── Types ───────────────────────────────────────────────────────────────

export interface ChartSurfaceHandle {
  /** The underlying lightweight-charts instance. */
  readonly chart: IChartApi;
  /** The main price series (candles). */
  readonly mainSeries: ISeriesApi<SeriesType>;
  /** The volume histogram series. */
  readonly volumeSeries: ISeriesApi<SeriesType>;
  /** The container DOM element. */
  readonly container: HTMLDivElement;
  /** Mark that initial data load has happened (so consumers can skip fitContent). */
  readonly firstData: { current: boolean };
  /** Fit all visible data within the viewport. */
  fitContent(): void;
  /**
   * Replace all data on the main and volume series.
   * The first call automatically calls `fitContent`.
   */
  setData(bars: readonly ChartBar[]): void;
}

export interface ChartBar {
  time: number; // UTCTimestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartSurfaceProps {
  /** Optional theme override (defaults to dark theme). */
  theme?: ChartTheme;
  /** IANA timezone. Defaults to the browser's local timezone. */
  timezone?: string;
  /** Optional className for the container div. */
  className?: string;
  /** Optional inline style for the container div. */
  style?: React.CSSProperties;
  /** Children rendered inside the container but outside the chart canvas. */
  children?: ReactNode;
  /**
   * Called when the chart surface is ready with its imperative handle.
   * Fires synchronously during the layout phase — chart/series refs are
   * populated before parent effects run.
   */
  onReady?: (handle: ChartSurfaceHandle) => void;
}

// ── Component ───────────────────────────────────────────────────────────

/**
 * Shared lightweight-charts surface component.
 *
 * Creates a chart with candle + volume series and exposes an imperative
 * handle for the consuming page to add indicators, drawings, patterns, etc.
 *
 * Uses `useLayoutEffect` for chart creation so the handle is populated
 * before any parent `useEffect` runs — critical for data-loading effects
 * that expect `chartRef.current` to be non-null.
 *
 * Usage:
 * ```tsx
 * const surfaceRef = useRef<ChartSurfaceHandle>(null);
 * <ChartSurface ref={surfaceRef} />
 * ```
 */
export const ChartSurface = forwardRef<ChartSurfaceHandle, ChartSurfaceProps>(
  function ChartSurface({ theme, timezone, className, style, children, onReady }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleRef = useRef<ISeriesApi<SeriesType> | null>(null);
    const volumeRef = useRef<ISeriesApi<SeriesType> | null>(null);
    const firstDataRef = useRef(true);
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;

    // Build the handle once. All fields are getters so they always
    // return the current ref values.
    const handleRef = useRef<ChartSurfaceHandle>({
      get chart() {
        return chartRef.current!;
      },
      get mainSeries() {
        return candleRef.current!;
      },
      get volumeSeries() {
        return volumeRef.current!;
      },
      get container() {
        return containerRef.current!;
      },
      get firstData() {
        return firstDataRef;
      },
      fitContent() {
        chartRef.current?.timeScale().fitContent();
      },
      setData(bars: readonly ChartBar[]) {
        const candle = candleRef.current;
        const volume = volumeRef.current;
        const chart = chartRef.current;
        if (!candle || !volume) return;
        setData(
          candle,
          bars.map((b) => ({
            time: b.time as UTCTimestamp,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          })),
        );
        setData(
          volume,
          bars.map((b) => ({
            time: b.time as UTCTimestamp,
            value: b.volume ?? 0,
          })),
        );
        if (firstDataRef.current) {
          chart?.timeScale().fitContent();
          firstDataRef.current = false;
        }
      },
    } as ChartSurfaceHandle);

    // Create chart during layout so everything is ready before effects fire.
    useLayoutEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const chart = createTvChart({
        container,
        theme: theme ?? darkTheme,
        ...(timezone != null ? { timezone } as { timezone: string } : {}),
      });

      const candle = addSeries(chart, 'candles');
      const volume = addSeries(chart, 'histogram', {
        priceScaleId: '',
        priceFormat: { type: 'volume' },
        color: 'rgba(38, 166, 154, 0.35)',
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

      chartRef.current = chart;
      candleRef.current = candle;
      volumeRef.current = volume;
      firstDataRef.current = true;

      // Notify parent synchronously (layout phase) so parent refs
      // are populated before any useEffect runs.
      onReadyRef.current?.(handleRef.current);

      return () => {
        removeChart(chart);
        chartRef.current = null;
        candleRef.current = null;
        volumeRef.current = null;
      };
      // Run once on mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Imperative handle for ref forwarding.
    useImperativeHandle(ref, () => handleRef.current, []);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ width: '100%', height: '100%', position: 'relative', ...style }}
      >
        {children}
      </div>
    );
  },
);
