import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { KLineChartPro, type ChartProOptions, type SymbolInfo, type Period } from '@klinecharts/pro';
import type { Chart } from 'klinecharts';
import '@klinecharts/pro/dist/klinecharts-pro.css';
import { TradingviuDatafeed } from './klinepro-datafeed';

const DEFAULT_PERIODS: Period[] = [
  { multiplier: 1, timespan: 'minute', text: '1m' },
  { multiplier: 5, timespan: 'minute', text: '5m' },
  { multiplier: 15, timespan: 'minute', text: '15m' },
  { multiplier: 1, timespan: 'hour', text: '1H' },
  { multiplier: 4, timespan: 'hour', text: '4H' },
  { multiplier: 1, timespan: 'day', text: '1D' },
  { multiplier: 1, timespan: 'week', text: '1W' },
];

const DEFAULT_PERIOD: Period = { multiplier: 1, timespan: 'day', text: '1D' };

export interface KLineProChartProps {
  symbol: SymbolInfo;
  period?: Period;
  theme?: 'dark' | 'light';
  datafeed?: TradingviuDatafeed;
  hidePeriodBar?: boolean;
}

export interface KLineProChartHandle {
  getChartApi(): Chart | null;
  getChartPro(): KLineChartPro | null;
  getDatafeed(): TradingviuDatafeed | null;
}

export const KLineProChart = forwardRef<KLineProChartHandle, KLineProChartProps>(
  function KLineProChart(
    { symbol, period, theme = 'dark', datafeed, hidePeriodBar = false },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartProRef = useRef<KLineChartPro | null>(null);
    const datafeedRef = useRef<TradingviuDatafeed | null>(null);

    useImperativeHandle(ref, () => ({
      getChartApi: () => (chartProRef.current as Record<string, unknown> | null)?._chartApi as Chart | null ?? null,
      getChartPro: () => chartProRef.current,
      getDatafeed: () => datafeedRef.current,
    }), []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const df = datafeed ?? new TradingviuDatafeed();
      datafeedRef.current = df;
      const options: ChartProOptions = {
        container,
        symbol,
        period: period ?? DEFAULT_PERIOD,
        periods: DEFAULT_PERIODS,
        datafeed: df,
        drawingBarVisible: true,
        theme,
        locale: 'en-US',
        mainIndicators: ['MA'],
        subIndicators: ['VOL'],
      };
      chartProRef.current = new KLineChartPro(options);
      return () => {
        if (!datafeed) df.reset();
        chartProRef.current = null;
        datafeedRef.current = null;
        container.innerHTML = '';
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      chartProRef.current?.setSymbol(symbol);
    }, [symbol]);

    useEffect(() => {
      if (period) chartProRef.current?.setPeriod(period);
    }, [period]);

    useEffect(() => {
      chartProRef.current?.setTheme(theme);
    }, [theme]);

    // Hide period bar via CSS when requested (for layout panels).
    useEffect(() => {
      if (hidePeriodBar && containerRef.current) {
        containerRef.current.classList.add('klinepro-hide-period-bar');
      }
    }, [hidePeriodBar]);

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
  },
);
