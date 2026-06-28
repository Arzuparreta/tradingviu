import { useEffect, useRef } from 'react';
import { KLineChartPro, type ChartProOptions, type SymbolInfo, type Period } from '@klinecharts/pro';
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
}

/**
 * React wrapper around the imperative KLineChart Pro widget. Pro ships the full
 * TradingView-style drawing suite (toolbar via `drawingBarVisible`), indicators,
 * period bar, and symbol search out of the box.
 */
export function KLineProChart({ symbol, period, theme = 'dark' }: KLineProChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<KLineChartPro | null>(null);

  // Mount once. Symbol/period/theme updates are pushed imperatively below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const options: ChartProOptions = {
      container,
      symbol,
      period: period ?? DEFAULT_PERIOD,
      periods: DEFAULT_PERIODS,
      datafeed: new TradingviuDatafeed(),
      drawingBarVisible: true,
      theme,
      locale: 'en-US',
      mainIndicators: ['MA'],
      subIndicators: ['VOL'],
    };
    chartRef.current = new KLineChartPro(options);
    return () => {
      chartRef.current = null;
      container.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setSymbol(symbol);
  }, [symbol]);

  useEffect(() => {
    if (period) chartRef.current?.setPeriod(period);
  }, [period]);

  useEffect(() => {
    chartRef.current?.setTheme(theme);
  }, [theme]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
