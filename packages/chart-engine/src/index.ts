import {
  createChart,
  createSeriesMarkers,
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
  type LineStyle,
  type LineWidth,
  type IPriceLine,
  type MouseEventParams,
  type TimeChartOptions,
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
  crosshair: { color: '#758696', width: 1, style: 3 },
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
  crosshair: { color: '#9598a1', width: 1, style: 3 },
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
      mode: 1,
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
