import {
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  BarSeries,
  BaselineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
  type BusinessDay,
  type SeriesMarker,
  type SeriesMarkerPosition,
  type SeriesMarkerShape,
  type LineWidth,
  type IPriceLine,
  type MouseEventParams,
  type TimeChartOptions,
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
  type SeriesAttachedParameter,
} from 'lightweight-charts';

export type {
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesType,
  Time,
  UTCTimestamp,
  BusinessDay,
  SeriesMarker,
  SeriesMarkerPosition,
  SeriesMarkerShape,
  LineStyle,
  LineWidth,
  IPriceLine,
  MouseEventParams,
  TimeChartOptions,
};

export type SeriesKind = 'candles' | 'line' | 'area' | 'bars' | 'baseline' | 'histogram';

export interface ChartTheme {
  layoutBackground: { color: string };
  textColor: string;
  gridColor: string;
  borderColor: string;
  upColor: string;
  downColor: string;
  wickUpColor: string;
  wickDownColor: string;
  crosshair: { color: string; width: LineWidth; style: LineStyle };
}

export const darkTheme: ChartTheme = {
  layoutBackground: { color: '#0e0e0e' },
  textColor: '#d1d4dc',
  gridColor: '#1f2229',
  borderColor: '#2a2e39',
  upColor: '#26a69a',
  downColor: '#ef5350',
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
  crosshair: { color: '#758696', width: 1, style: LineStyle.LargeDashed },
};

export const lightTheme: ChartTheme = {
  layoutBackground: { color: '#ffffff' },
  textColor: '#131722',
  gridColor: '#e0e3eb',
  borderColor: '#d1d4dc',
  upColor: '#26a69a',
  downColor: '#ef5350',
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
  crosshair: { color: '#9598a1', width: 1, style: LineStyle.LargeDashed },
};

export interface CreateChartOptions extends Partial<TimeChartOptions> {
  container: HTMLElement;
  theme?: ChartTheme;
  autoSize?: boolean;
  /**
   * IANA timezone id (e.g. 'Europe/Madrid'). Defaults to the browser's local
   * timezone. Lightweight-charts renders all timestamps in this zone; the
   * underlying `time` value stays in UTC seconds.
   */
  timezone?: string;
}

const detectLocalTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

const TICKMARK_FORMATTERS: Map<string, Intl.DateTimeFormat> = new Map();

/**
 * Returns an Intl.DateTimeFormat for the given timezone, memoized.
 */
const getTzFormatter = (tz: string): Intl.DateTimeFormat => {
  let f = TICKMARK_FORMATTERS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false });
    TICKMARK_FORMATTERS.set(tz, f);
  }
  return f;
};

/**
 * lightweight-charts v5.x ships no public `timezone` option. We work around
 * that by feeding the time scale a tickMarkFormatter that prints each
 * tick in the chosen IANA zone. The bar `time` values stay UTC seconds;
 * only the displayed labels are converted.
 */
const makeLocalTzFormatter = (tz: string) => {
  const f = getTzFormatter(tz);
  return (time: import('lightweight-charts').Time, tickMarkType: import('lightweight-charts').TickMarkType): string | null => {
    const t = typeof time === 'number' ? time : Number(time);
    if (!Number.isFinite(t)) return null;
    const d = new Date(t * 1000);
    const parts = f.formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    switch (tickMarkType) {
      case 0: // Year
        return get('year');
      case 1: // Month
        return get('month') + ' ' + get('year').slice(2);
      case 2: // DayOfMonth
        return get('day') + ' ' + get('month');
      case 3: // Time
        return get('hour') + ':' + get('minute');
      case 4: // TimeWithSeconds
        return get('hour') + ':' + get('minute') + ':' + get('second');
      default:
        return null;
    }
  };
};

export const createTvChart = (opts: CreateChartOptions): IChartApi => {
  const theme = opts.theme ?? darkTheme;
  // Lightweight-charts v5.x doesn't expose a `timezone` option in its public
  // types. The underlying data is UTC seconds; we render in the browser's
  // local zone via a custom tickMarkFormatter (set on the time scale below).
  const tz = opts.timezone ?? detectLocalTimezone();
  const tickMarkFormatter = makeLocalTzFormatter(tz);
  const chart = createChart(opts.container, {
    width: opts.width ?? opts.container.clientWidth,
    height: opts.height ?? opts.container.clientHeight,
    layout: {
      background: { color: theme.layoutBackground.color },
      textColor: theme.textColor,
      ...opts.layout,
    },
    grid: {
      vertLines: { color: theme.gridColor },
      horzLines: { color: theme.gridColor },
      ...opts.grid,
    },
    rightPriceScale: {
      borderColor: theme.borderColor,
      ...opts.rightPriceScale,
    },
    timeScale: {
      borderColor: theme.borderColor,
      timeVisible: true,
      secondsVisible: false,
      tickMarkFormatter,
      ...opts.timeScale,
    },
    crosshair: {
      // Free-moving crosshair (TradingView default). `Magnet` (1) snapped the
      // crosshair to candle OHLC values, which felt broken to users.
      mode: CrosshairMode.Normal,
      vertLine: {
        color: theme.crosshair.color,
        width: theme.crosshair.width,
        style: theme.crosshair.style,
      },
      horzLine: {
        color: theme.crosshair.color,
        width: theme.crosshair.width,
        style: theme.crosshair.style,
      },
      ...opts.crosshair,
    },
    autoSize: opts.autoSize ?? true,
    localization: {
      locale: navigator.language,
      ...opts.localization,
    },
  });

  if (opts.autoSize) {
    const ro = new ResizeObserver(() => {
      chart.applyOptions({
        width: opts.container.clientWidth,
        height: opts.container.clientHeight,
      });
    });
    ro.observe(opts.container);
    (chart as unknown as { __ro?: ResizeObserver }).__ro = ro;
  }

  return chart;
};

export type VisibleTimeRangeHandler = (range: { from: Time | null; to: Time | null } | null) => void;

export const subscribeVisibleTimeRange = (
  chart: IChartApi,
  cb: VisibleTimeRangeHandler,
): (() => void) => {
  const handler = (range: { from: Time; to: Time } | null) => {
    if (range === null) {
      cb(null);
      return;
    }
    cb({ from: range.from, to: range.to });
  };
  chart.timeScale().subscribeVisibleTimeRangeChange(handler);
  return () => {
    chart.timeScale().unsubscribeVisibleTimeRangeChange(handler);
  };
};

export const addSeries = <T extends SeriesKind>(
  chart: IChartApi,
  kind: T,
  options?: Record<string, unknown>,
): ISeriesApi<SeriesType> => {
  switch (kind) {
    case 'candles':
      return chart.addSeries(CandlestickSeries, options ?? {});
    case 'line':
      return chart.addSeries(LineSeries, options ?? {});
    case 'area':
      return chart.addSeries(AreaSeries, options ?? {});
    case 'bars':
      return chart.addSeries(BarSeries, options ?? {});
    case 'baseline':
      return chart.addSeries(BaselineSeries, options ?? {});
    case 'histogram':
      return chart.addSeries(HistogramSeries, options ?? {});
  }
};

export const setData = (
  series: ISeriesApi<SeriesType>,
  data: ReadonlyArray<{
    time: Time;
    value?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
  }>,
): void => {
  if (series.seriesType() === 'Candlestick' || series.seriesType() === 'Bar') {
    series.setData(
      data
        .filter((d) => isFiniteOHLC(d.open, d.high, d.low, d.close))
        .map((d) => ({
          time: d.time,
          open: d.open ?? 0,
          high: d.high ?? 0,
          low: d.low ?? 0,
          close: d.close ?? 0,
        })),
    );
  } else {
    series.setData(
      data
        .filter((d) => Number.isFinite(d.value ?? d.close ?? NaN))
        .map((d) => ({ time: d.time, value: d.value ?? d.close ?? 0 })),
    );
  }
};

export const update = (
  series: ISeriesApi<SeriesType>,
  bar: {
    time: Time;
    value?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
  },
): void => {
  if (series.seriesType() === 'Candlestick' || series.seriesType() === 'Bar') {
    if (!isFiniteOHLC(bar.open, bar.high, bar.low, bar.close)) return;
    series.update({
      time: bar.time,
      open: bar.open ?? 0,
      high: bar.high ?? 0,
      low: bar.low ?? 0,
      close: bar.close ?? 0,
    });
  } else {
    const v = bar.value ?? bar.close ?? 0;
    if (!Number.isFinite(v)) return;
    series.update({ time: bar.time, value: v });
  }
};

/**
 * Validate OHLC. Rejects bars that would render as 0/Infinity/NaN or
 * violate `high >= max(open, close)` / `low <= min(open, close)`. The
 * lightweight-charts canvas draws these as candles at y=0 or as
 * disconnected spikes — a common source of the "broken candle" symptom.
 */
const isFiniteOHLC = (
  open: number | undefined,
  high: number | undefined,
  low: number | undefined,
  close: number | undefined,
): boolean => {
  if (![open, high, low, close].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return false;
  }
  const o = open as number;
  const h = high as number;
  const l = low as number;
  const c = close as number;
  if (h < Math.max(o, c)) return false;
  if (l > Math.min(o, c)) return false;
  return true;
};

export const createMarkers = (
  series: ISeriesApi<SeriesType>,
  markers: SeriesMarker<Time>[] = [],
): ISeriesMarkersPluginApi<Time> => createSeriesMarkers(series, markers);

export const removeChart = (chart: IChartApi): void => {
  const ro = (chart as unknown as { __ro?: ResizeObserver }).__ro;
  if (ro) ro.disconnect();
  chart.remove();
};

// --- Ichimoku cloud (kumo) primitive ------------------------------------

/** One column of the cloud: both leading spans at the same (displaced) time. */
export interface IchimokuCloudPoint {
  readonly time: number;
  readonly spanA: number;
  readonly spanB: number;
}

export interface IchimokuCloudColors {
  /** Fill where Span A ≥ Span B (bullish kumo). */
  bull?: string;
  /** Fill where Span A < Span B (bearish kumo). */
  bear?: string;
}

export interface IchimokuCloudHandle {
  setData(points: ReadonlyArray<IchimokuCloudPoint>): void;
  remove(): void;
}

/**
 * Attach an Ichimoku cloud (kumo) to `series`: a filled band between Senkou
 * Span A and Span B — green where A ≥ B, red where A < B, with the fill split at
 * each twist (A/B crossover, where the band has zero width). Drawn beneath the
 * candles. The span line series must carry the (forward-displaced) cloud times
 * so the time scale can resolve `timeToCoordinate` for them.
 */
export const createIchimokuCloud = (
  series: ISeriesApi<SeriesType>,
  colors: IchimokuCloudColors = {},
): IchimokuCloudHandle => {
  const bull = colors.bull ?? 'rgba(38, 166, 154, 0.20)';
  const bear = colors.bear ?? 'rgba(239, 83, 80, 0.20)';

  let chart: IChartApi | null = null;
  let attached: ISeriesApi<SeriesType> = series;
  let requestUpdate: (() => void) | null = null;
  let data: IchimokuCloudPoint[] = [];

  const fillTrap = (
    ctx: CanvasRenderingContext2D,
    x0: number, a0: number, b0: number,
    x1: number, a1: number, b1: number,
    color: string,
  ): void => {
    ctx.beginPath();
    ctx.moveTo(x0, a0);
    ctx.lineTo(x1, a1);
    ctx.lineTo(x1, b1);
    ctx.lineTo(x0, b0);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      const c = chart;
      if (!c || data.length < 2) return;
      target.useBitmapCoordinateSpace((scope) => {
        const ctx = scope.context;
        const ts = c.timeScale();
        const hpr = scope.horizontalPixelRatio;
        const vpr = scope.verticalPixelRatio;
        type XY = { x: number; a: number; b: number } | null;
        const pts: XY[] = data.map((d) => {
          const x = ts.timeToCoordinate(d.time as Time);
          const ya = attached.priceToCoordinate(d.spanA);
          const yb = attached.priceToCoordinate(d.spanB);
          if (x == null || ya == null || yb == null) return null;
          return {
            x: (x as number) * hpr,
            a: (ya as number) * vpr,
            b: (yb as number) * vpr,
          };
        });
        for (let i = 0; i + 1 < pts.length; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          if (!p0 || !p1) continue;
          const d0 = data[i]!.spanA - data[i]!.spanB;
          const d1 = data[i + 1]!.spanA - data[i + 1]!.spanB;
          if ((d0 >= 0) === (d1 >= 0) || d0 === 0 || d1 === 0) {
            fillTrap(ctx, p0.x, p0.a, p0.b, p1.x, p1.a, p1.b, d0 + d1 >= 0 ? bull : bear);
          } else {
            // Twist: split at the crossing, where the two spans meet.
            const f = d0 / (d0 - d1);
            const xc = p0.x + (p1.x - p0.x) * f;
            const yc = p0.a + (p1.a - p0.a) * f;
            fillTrap(ctx, p0.x, p0.a, p0.b, xc, yc, yc, d0 >= 0 ? bull : bear);
            fillTrap(ctx, xc, yc, yc, p1.x, p1.a, p1.b, d1 >= 0 ? bull : bear);
          }
        }
      });
    },
  };

  const paneView: IPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: () => renderer,
  };

  const primitive: ISeriesPrimitive<Time> = {
    attached(param: SeriesAttachedParameter<Time>) {
      chart = param.chart as IChartApi;
      attached = param.series as ISeriesApi<SeriesType>;
      requestUpdate = param.requestUpdate;
    },
    detached() {
      chart = null;
      requestUpdate = null;
    },
    updateAllViews() {},
    paneViews: () => [paneView],
  };

  series.attachPrimitive(primitive);

  return {
    setData(points) {
      data = points.slice();
      requestUpdate?.();
    },
    remove() {
      try {
        series.detachPrimitive(primitive);
      } catch {
        // series already removed with the chart; nothing to detach
      }
      chart = null;
    },
  };
};
