import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  BarSeries,
  BaselineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
  type BusinessDay,
  type SeriesMarker,
  type SeriesMarkerPosition,
  type LineStyle,
  type LineWidth,
  type IPriceLine,
  type MouseEventParams,
  type TimeChartOptions,
} from 'lightweight-charts';

export type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
  UTCTimestamp,
  BusinessDay,
  SeriesMarker,
  SeriesMarkerPosition,
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
}

export const createTvChart = (opts: CreateChartOptions): IChartApi => {
  const theme = opts.theme ?? darkTheme;
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
      ...opts.timeScale,
    },
    crosshair: {
      mode: 1,
      ...opts.crosshair,
    },
    autoSize: opts.autoSize ?? true,
  });

  if (opts.autoSize) {
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: opts.container.clientWidth, height: opts.container.clientHeight });
    });
    ro.observe(opts.container);
    (chart as unknown as { __ro?: ResizeObserver }).__ro = ro;
  }

  return chart;
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

export const setData = (series: ISeriesApi<SeriesType>, data: ReadonlyArray<{ time: Time; value?: number; open?: number; high?: number; low?: number; close?: number }>): void => {
  if (series.seriesType() === 'Candlestick' || series.seriesType() === 'Bar') {
    series.setData(
      data.map((d) => ({
        time: d.time,
        open: d.open ?? 0,
        high: d.high ?? 0,
        low: d.low ?? 0,
        close: d.close ?? 0,
      })),
    );
  } else {
    series.setData(data.map((d) => ({ time: d.time, value: d.value ?? d.close ?? 0 })));
  }
};

export const update = (series: ISeriesApi<SeriesType>, bar: { time: Time; value?: number; open?: number; high?: number; low?: number; close?: number; volume?: number }): void => {
  if (series.seriesType() === 'Candlestick' || series.seriesType() === 'Bar') {
    series.update({
      time: bar.time,
      open: bar.open ?? 0,
      high: bar.high ?? 0,
      low: bar.low ?? 0,
      close: bar.close ?? 0,
    });
  } else {
    series.update({ time: bar.time, value: bar.value ?? bar.close ?? 0 });
  }
};

export const removeChart = (chart: IChartApi): void => {
  const ro = (chart as unknown as { __ro?: ResizeObserver }).__ro;
  if (ro) ro.disconnect();
  chart.remove();
};
