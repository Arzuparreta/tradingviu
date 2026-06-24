import { useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';
import { createTvChart, addSeries, setData, update, removeChart, darkTheme } from '@tv/chart-engine';
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;
type Interval = (typeof INTERVALS)[number];

const TYPES = ['candles', 'line', 'area', 'bars', 'baseline'] as const;
type ChartType = (typeof TYPES)[number];

export function ChartPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const navigate = useNavigate();
  const { user, tenant } = useAuth();
  const params = useParams<{ symbol?: string }>();
  const symbolId = params.symbol;

  const symbolsQ = useQuery({
    queryKey: ['symbols'],
    queryFn: () => api.allSymbols(20),
    enabled: !symbolId,
  });

  const historyQ = useQuery({
    queryKey: ['history', symbolId, '1h'],
    queryFn: () => api.history(symbolId!, '1h', 500),
    enabled: !!symbolId,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createTvChart({ container: containerRef.current, theme: darkTheme });
    chartRef.current = chart;
    return () => {
      removeChart(chart);
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !historyQ.data) return;
    if (seriesRef.current) {
      chartRef.current.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    const series = addSeries(chartRef.current, 'candles');
    const bars = historyQ.data.bars.map((b) => ({
      time: b.time as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    setData(series, bars);
    chartRef.current.timeScale().fitContent();
    seriesRef.current = series;
  }, [historyQ.data]);

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || !historyQ.data?.bars.length) return;
    const last = historyQ.data.bars.at(-1)!;
    update(seriesRef.current, {
      time: last.time as UTCTimestamp,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
    });
  }, [historyQ.dataUpdatedAt]);

  if (!user) {
    return (
      <div className="page">
        <p>You need to <Link to="/login">log in</Link> to view charts.</p>
      </div>
    );
  }

  if (!symbolId) {
    return (
      <div className="page">
        <h1>Pick a symbol</h1>
        {symbolsQ.isLoading && <p>Loading symbols…</p>}
        {symbolsQ.data && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {symbolsQ.data.results.map((s) => (
              <button key={s.id} onClick={() => navigate(`/chart/${s.id}`)} className="ghost">
                <span className="mono">{s.exchange}:{s.ticker}</span>
                <span className="muted small" style={{ marginLeft: 8 }}>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="chart-layout">
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0e0e0e' }} />
      <div className="chart-toolbar">
        <span className="muted">{tenant?.planCode.toUpperCase()} · {tenant?.slug}</span>
        <span className="grow" />
        {historyQ.data && (
          <span className="mono small">
            {historyQ.data.symbol.exchange}:{historyQ.data.symbol.ticker} · {historyQ.data.bars.length} bars
          </span>
        )}
        {historyQ.isFetching && <span className="muted small">refreshing…</span>}
        <Link to="/" className="muted small">home</Link>
      </div>
    </div>
  );
}
