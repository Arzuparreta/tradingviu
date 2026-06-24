import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '../api/client';
import { useAuth } from '../stores/auth';
import {
  createTvChart,
  addSeries,
  setData,
  update,
  removeChart,
  darkTheme,
} from '@tv/chart-engine';
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;
type Interval = (typeof INTERVALS)[number];

interface IndicatorConfig {
  id: string;
  params: Record<string, number>;
}

export function ChartPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const indicatorBandSeriesRef = useRef<Map<string, { upper: ISeriesApi<SeriesType>; middle: ISeriesApi<SeriesType>; lower: ISeriesApi<SeriesType> }>>(new Map());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, tenant } = useAuth();
  const params = useParams<{ symbol?: string }>();
  const symbolId = params.symbol;
  const [interval, setInterval] = useState<Interval>('1h');
  const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig[]>([]);

  const symbolsQ = useQuery({
    queryKey: ['symbols'],
    queryFn: () => api.allSymbols(20),
    enabled: !symbolId,
  });

  const indicatorsQ = useQuery({
    queryKey: ['indicators'],
    queryFn: () => api.indicators(),
    enabled: !!user,
    staleTime: Infinity,
  });

  const historyQ = useQuery({
    queryKey: ['history', symbolId, interval],
    queryFn: () => api.history(symbolId!, interval, 500),
    enabled: !!symbolId,
    refetchInterval: 30_000,
  });

  const indicatorQueries = useQueries({
    queries: activeIndicators.map((ind) => ({
      queryKey: ['indicator', ind.id, symbolId, interval, ind.params],
      queryFn: () => api.computeIndicator(ind.id, symbolId!, interval, ind.params, 500),
      enabled: !!symbolId,
      staleTime: 30_000,
    })),
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createTvChart({ container: containerRef.current, theme: darkTheme });
    chartRef.current = chart;
    return () => {
      removeChart(chart);
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      indicatorSeriesRef.current.clear();
      indicatorBandSeriesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !historyQ.data) return;
    if (candleRef.current) {
      chartRef.current.removeSeries(candleRef.current);
      candleRef.current = null;
    }
    if (volumeRef.current) {
      chartRef.current.removeSeries(volumeRef.current);
      volumeRef.current = null;
    }
    const candle = addSeries(chartRef.current, 'candles');
    const volume = addSeries(chartRef.current, 'histogram');
    const bars = historyQ.data.bars.map((b) => ({
      time: b.time as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    setData(candle, bars);
    setData(volume, historyQ.data.bars.map((b) => ({
      time: b.time as UTCTimestamp,
      value: b.volume,
    })));
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chartRef.current.timeScale().fitContent();
    candleRef.current = candle;
    volumeRef.current = volume;
  }, [historyQ.data]);

  useEffect(() => {
    if (!chartRef.current || !historyQ.data?.bars.length) return;
    if (!candleRef.current || !volumeRef.current) return;
    const last = historyQ.data.bars.at(-1)!;
    update(candleRef.current, {
      time: last.time as UTCTimestamp,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
    });
    update(volumeRef.current, { time: last.time as UTCTimestamp, value: last.volume });
  }, [historyQ.dataUpdatedAt]);

  useEffect(() => {
    if (!chartRef.current) return;
    for (const [id, s] of indicatorSeriesRef.current) {
      if (!activeIndicators.find((a) => a.id === id)) {
        try { chartRef.current.removeSeries(s); } catch {}
        indicatorSeriesRef.current.delete(id);
      }
    }
    for (const [id, band] of indicatorBandSeriesRef.current) {
      if (!activeIndicators.find((a) => a.id === id)) {
        try { chartRef.current.removeSeries(band.upper); } catch {}
        try { chartRef.current.removeSeries(band.middle); } catch {}
        try { chartRef.current.removeSeries(band.lower); } catch {}
        indicatorBandSeriesRef.current.delete(id);
      }
    }
  }, [activeIndicators]);

  useEffect(() => {
    if (!chartRef.current || !historyQ.data) return;
    for (let i = 0; i < indicatorQueries.length; i++) {
      const q = indicatorQueries[i];
      const ind = activeIndicators[i];
      if (!q?.data || !ind) continue;
      const out = q.data.output;
      if (out.overlay) {
        for (const line of out.lines) {
          const key = `${ind.id}:${line.key}`;
          let s = indicatorSeriesRef.current.get(key);
          if (!s) {
            s = addSeries(chartRef.current, 'line');
            indicatorSeriesRef.current.set(key, s);
          }
          setData(s, out.points as never);
        }
        if (out.bands) {
          const bandKey = ind.id;
          let band = indicatorBandSeriesRef.current.get(bandKey);
          if (!band) {
            band = {
              upper: addSeries(chartRef.current, 'line'),
              middle: addSeries(chartRef.current, 'line'),
              lower: addSeries(chartRef.current, 'line'),
            };
            indicatorBandSeriesRef.current.set(bandKey, band);
          }
          setData(band.upper, out.bands.map((b: { time: number; upper: number }) => ({ time: b.time as UTCTimestamp, value: b.upper })));
          setData(band.middle, out.bands.map((b: { time: number; middle: number }) => ({ time: b.time as UTCTimestamp, value: b.middle })));
          setData(band.lower, out.bands.map((b: { time: number; lower: number }) => ({ time: b.time as UTCTimestamp, value: b.lower })));
        }
      }
    }
  }, [indicatorQueries, historyQ.data]);

  useEffect(() => {
    if (!symbolId || !historyQ.data) return;
    const token = getToken();
    if (!token) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${token}`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', symbol: `${historyQ.data!.symbol.exchange}:${historyQ.data!.symbol.ticker}`, interval }));
    };
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
      } catch {}
    };
    return () => ws.close();
  }, [symbolId, interval, historyQ.data?.symbol.exchange, historyQ.data?.symbol.ticker]);

  const addIndicator = useCallback((id: string) => {
    if (activeIndicators.find((a) => a.id === id)) return;
    const def = indicatorsQ.data?.indicators.find((i) => i.id === id);
    setActiveIndicators((prev) => [...prev, { id, params: def?.defaults ?? {} }]);
  }, [activeIndicators, indicatorsQ.data]);

  const removeIndicator = useCallback((id: string) => {
    setActiveIndicators((prev) => prev.filter((a) => a.id !== id));
  }, []);

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

  const overlayIndicators = indicatorsQ.data?.indicators.filter((i) => i.overlay) ?? [];

  return (
    <div className="chart-layout">
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0e0e0e' }} />
      <div className="chart-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <select value={interval} onChange={(e) => setInterval(e.target.value as Interval)} style={{ width: 80 }}>
          {INTERVALS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <span className="muted small">|</span>
        <select
          value=""
          onChange={(e) => { if (e.target.value) addIndicator(e.target.value); e.target.value = ''; }}
          style={{ width: 160 }}
        >
          <option value="">+ Add indicator…</option>
          {overlayIndicators.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        {activeIndicators.map((a) => {
          const def = indicatorsQ.data?.indicators.find((i) => i.id === a.id);
          return (
            <span key={a.id} className="row" style={{ gap: 4, padding: '2px 8px', background: 'var(--bg-3)', borderRadius: 4, fontSize: 12 }}>
              {def?.name ?? a.id}
              <button onClick={() => removeIndicator(a.id)} style={{ padding: '0 6px', fontSize: 12, lineHeight: 1 }}>×</button>
            </span>
          );
        })}
        <span className="grow" />
        {historyQ.data && (
          <span className="mono small">
            {historyQ.data.symbol.exchange}:{historyQ.data.symbol.ticker} · {historyQ.data.bars.length} bars · {activeIndicators.length} indicators
          </span>
        )}
        {historyQ.isFetching && <span className="muted small">refreshing…</span>}
        <Link to="/" className="muted small">home</Link>
      </div>
    </div>
  );
}
