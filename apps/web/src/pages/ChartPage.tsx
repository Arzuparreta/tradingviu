import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '../api/client';
import { useAuth } from '../stores/auth';
import {
  createTvChart,
  addSeries,
  setData,
  update,
  createMarkers,
  removeChart,
  darkTheme,
} from '@tv/chart-engine';
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import type { DomLevel } from '../api/types';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;
type Interval = (typeof INTERVALS)[number];

interface IndicatorConfig {
  id: string;
  params: Record<string, number>;
}

/** Compact volume label: 1234567 → "1.23M", 4500 → "4.5K". */
function formatVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(v < 1 ? 2 : 0);
}

export function ChartPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const indicatorBandSeriesRef = useRef<
    Map<
      string,
      {
        upper: ISeriesApi<SeriesType>;
        middle: ISeriesApi<SeriesType>;
        lower: ISeriesApi<SeriesType>;
      }
    >
  >(new Map());
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const chartPatternSeriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const volumeProfileLinesRef = useRef<IPriceLine[]>([]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, tenant } = useAuth();
  const params = useParams<{ symbol?: string }>();
  const symbolId = params.symbol;
  const [interval, setInterval] = useState<Interval>('1h');
  const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig[]>([]);
  const [showPatterns, setShowPatterns] = useState(false);
  const [showChartPatterns, setShowChartPatterns] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [destination, setDestination] = useState<'paper' | 'broker'>('paper');
  const [paperAccountId, setPaperAccountId] = useState('');
  const [brokerConnectionId, setBrokerConnectionId] = useState('');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('limit');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');

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

  const patternsQ = useQuery({
    queryKey: ['patterns', symbolId, interval],
    queryFn: () => api.scanPatterns(symbolId!, interval, 500),
    enabled: !!symbolId && showPatterns,
    staleTime: 30_000,
  });

  const chartPatternsQ = useQuery({
    queryKey: ['chart-patterns', symbolId, interval],
    queryFn: () => api.scanChartPatterns(symbolId!, interval, 500),
    enabled: !!symbolId && showChartPatterns,
    staleTime: 30_000,
  });

  const volumeProfileQ = useQuery({
    queryKey: ['volume-profile', symbolId, interval],
    queryFn: () => api.volumeProfile(symbolId!, interval, 500, 24),
    enabled: !!symbolId && showVolumeProfile,
    staleTime: 30_000,
  });

  const domQ = useQuery({
    queryKey: ['dom', symbolId],
    queryFn: () => api.dom(symbolId!, 16),
    enabled: !!symbolId,
    refetchInterval: 5_000,
  });

  const paperAccountsQ = useQuery({
    queryKey: ['paper-accounts', 'chart-ticket'],
    queryFn: () => api.paperAccounts(),
    enabled: !!symbolId,
  });

  const brokerConnectionsQ = useQuery({
    queryKey: ['broker-connections', 'chart-ticket'],
    queryFn: () => api.brokerConnections(),
    enabled: !!symbolId,
  });

  const indicatorQueries = useQueries({
    queries: activeIndicators.map((ind) => ({
      queryKey: ['indicator', ind.id, symbolId, interval, ind.params],
      queryFn: () => api.computeIndicator(ind.id, symbolId!, interval, ind.params, 500),
      enabled: !!symbolId,
      staleTime: 30_000,
    })),
  });

  const lastPrice = domQ.data?.book.mid ?? historyQ.data?.bars.at(-1)?.close;

  useEffect(() => {
    if (!paperAccountId && paperAccountsQ.data?.accounts[0]) {
      setPaperAccountId(paperAccountsQ.data.accounts[0].id);
    }
  }, [paperAccountId, paperAccountsQ.data]);

  useEffect(() => {
    if (!brokerConnectionId && brokerConnectionsQ.data?.connections[0]) {
      setBrokerConnectionId(brokerConnectionsQ.data.connections[0].id);
    }
  }, [brokerConnectionId, brokerConnectionsQ.data]);

  useEffect(() => {
    setLimitPrice('');
  }, [symbolId]);

  const placeOrder = useMutation({
    mutationFn: async () => {
      if (!symbolId) throw new Error('Symbol is required');
      const parsedQuantity = Number(quantity);
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)
        throw new Error('Quantity must be positive');
      const parsedLimit = Number(limitPrice);
      const limit =
        orderType === 'limit' && Number.isFinite(parsedLimit) && parsedLimit > 0
          ? parsedLimit
          : undefined;
      if (orderType === 'limit' && limit === undefined) throw new Error('Limit price is required');
      if (destination === 'paper') {
        if (!paperAccountId) throw new Error('Select a paper account');
        if (lastPrice === undefined) throw new Error('Market price is not available');
        return api.placePaperOrder(paperAccountId, {
          symbolId,
          side: orderSide,
          type: orderType,
          quantity: parsedQuantity,
          lastPrice,
          ...(limit !== undefined ? { limitPrice: limit } : {}),
        });
      }
      if (!brokerConnectionId) throw new Error('Select a broker connection');
      const ticker = historyQ.data?.symbol.ticker ?? domQ.data?.symbol.ticker;
      if (!ticker) throw new Error('Broker symbol is not available');
      return api.placeBrokerOrder(brokerConnectionId, {
        symbol: ticker,
        side: orderSide,
        type: orderType,
        quantity: parsedQuantity,
        timeInForce: 'day',
        ...(limit !== undefined ? { limitPrice: limit } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper-accounts', 'chart-ticket'] });
      queryClient.invalidateQueries({ queryKey: ['broker-positions', brokerConnectionId] });
    },
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
      markersRef.current = null;
      chartPatternSeriesRef.current = [];
      volumeProfileLinesRef.current = [];
      indicatorSeriesRef.current.clear();
      indicatorBandSeriesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !historyQ.data) return;
    if (candleRef.current) {
      chartRef.current.removeSeries(candleRef.current);
      candleRef.current = null;
      // The markers plugin and price lines were attached to the series we
      // just removed; their handles are now stale.
      markersRef.current = null;
      volumeProfileLinesRef.current = [];
    }
    if (volumeRef.current) {
      chartRef.current.removeSeries(volumeRef.current);
      volumeRef.current = null;
    }
    const candle = addSeries(chartRef.current, 'candles');
    const volume = addSeries(chartRef.current, 'histogram', {
      priceScaleId: '',
      priceFormat: { type: 'volume' },
      color: 'rgba(38, 166, 154, 0.35)',
    });
    const bars = historyQ.data.bars.map((b) => ({
      time: b.time as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    setData(candle, bars);
    setData(
      volume,
      historyQ.data.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
      })),
    );
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chartRef.current.timeScale().fitContent();
    candleRef.current = candle;
    volumeRef.current = volume;
  }, [historyQ.data]);

  useEffect(() => {
    if (!candleRef.current) return;
    if (!markersRef.current) {
      markersRef.current = createMarkers(candleRef.current, []);
    }
    if (!showPatterns || !patternsQ.data) {
      markersRef.current.setMarkers([]);
      return;
    }
    const markers: SeriesMarker<Time>[] = patternsQ.data.matches.map((m) => {
      const abbrev = m.name
        .split(' ')
        .map((w) => w.charAt(0))
        .join('')
        .toUpperCase();
      if (m.direction === 'bearish') {
        return {
          time: m.time as UTCTimestamp,
          position: 'aboveBar',
          color: '#ef5350',
          shape: 'arrowDown',
          text: abbrev,
        };
      }
      if (m.direction === 'bullish') {
        return {
          time: m.time as UTCTimestamp,
          position: 'belowBar',
          color: '#26a69a',
          shape: 'arrowUp',
          text: abbrev,
        };
      }
      return {
        time: m.time as UTCTimestamp,
        position: 'aboveBar',
        color: '#b2b5be',
        shape: 'circle',
        text: abbrev,
      };
    });
    markersRef.current.setMarkers(markers);
  }, [patternsQ.data, showPatterns, historyQ.data]);

  // Draw each detected chart pattern as a polyline through its structural
  // points (pivots → breakout), colored by direction. One line series per
  // match; rebuilt whenever the data, the toggle, or the candles change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of chartPatternSeriesRef.current) {
      try {
        chart.removeSeries(s);
      } catch {
        // series already detached with the candle series; ignore
      }
    }
    chartPatternSeriesRef.current = [];
    if (!showChartPatterns || !chartPatternsQ.data) return;
    const colorFor = (d: string): string =>
      d === 'bullish' ? '#26a69a' : d === 'bearish' ? '#ef5350' : '#b2b5be';
    for (const m of chartPatternsQ.data.matches.slice(0, 12)) {
      const line = addSeries(chart, 'line', {
        color: colorFor(m.direction),
        lineWidth: 2,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      line.setData(m.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.price })));
      chartPatternSeriesRef.current.push(line);
    }
  }, [chartPatternsQ.data, showChartPatterns, historyQ.data]);

  // Volume profile: overlay the Point of Control and value-area bounds as
  // horizontal price lines on the candle series. Rebuilt whenever the data,
  // the toggle, or the candles change (the candle series owns the lines).
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    for (const line of volumeProfileLinesRef.current) {
      try {
        candle.removePriceLine(line);
      } catch {
        // candle series was recreated; the old handles are already gone
      }
    }
    volumeProfileLinesRef.current = [];
    if (!showVolumeProfile || !volumeProfileQ.data) return;
    const p = volumeProfileQ.data.profile;
    if (p.bins === 0) return;
    volumeProfileLinesRef.current = [
      candle.createPriceLine({
        price: p.poc,
        color: '#f0b90b',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'POC',
      }),
      candle.createPriceLine({
        price: p.vah,
        color: '#787b86',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'VAH',
      }),
      candle.createPriceLine({
        price: p.val,
        color: '#787b86',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'VAL',
      }),
    ];
  }, [volumeProfileQ.data, showVolumeProfile, historyQ.data]);

  useEffect(() => {
    if (!chartRef.current) return;
    for (const [id, s] of indicatorSeriesRef.current) {
      if (!activeIndicators.find((a) => a.id === id)) {
        try {
          chartRef.current.removeSeries(s);
        } catch {}
        indicatorSeriesRef.current.delete(id);
      }
    }
    for (const [id, band] of indicatorBandSeriesRef.current) {
      if (!activeIndicators.find((a) => a.id === id)) {
        try {
          chartRef.current.removeSeries(band.upper);
        } catch {}
        try {
          chartRef.current.removeSeries(band.middle);
        } catch {}
        try {
          chartRef.current.removeSeries(band.lower);
        } catch {}
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
          setData(
            band.upper,
            out.bands.map((b: { time: number; upper: number }) => ({
              time: b.time as UTCTimestamp,
              value: b.upper,
            })),
          );
          setData(
            band.middle,
            out.bands.map((b: { time: number; middle: number }) => ({
              time: b.time as UTCTimestamp,
              value: b.middle,
            })),
          );
          setData(
            band.lower,
            out.bands.map((b: { time: number; lower: number }) => ({
              time: b.time as UTCTimestamp,
              value: b.lower,
            })),
          );
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
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          symbol: `${historyQ.data!.symbol.exchange}:${historyQ.data!.symbol.ticker}`,
          interval,
        }),
      );
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

  const addIndicator = useCallback(
    (id: string) => {
      if (activeIndicators.find((a) => a.id === id)) return;
      const def = indicatorsQ.data?.indicators.find((i) => i.id === id);
      setActiveIndicators((prev) => [...prev, { id, params: def?.defaults ?? {} }]);
    },
    [activeIndicators, indicatorsQ.data],
  );

  const removeIndicator = useCallback((id: string) => {
    setActiveIndicators((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const formatPrice = useCallback(
    (price: number) => {
      const tickSize = domQ.data?.book.tickSize ?? 0.01;
      const decimals = Math.min(8, Math.max(2, Math.ceil(Math.log10(1 / tickSize))));
      return price.toFixed(decimals);
    },
    [domQ.data?.book.tickSize],
  );

  const selectDomLevel = useCallback(
    (side: 'bid' | 'ask', price: number) => {
      setOrderType('limit');
      setOrderSide(side === 'ask' ? 'buy' : 'sell');
      setLimitPrice(formatPrice(price));
    },
    [formatPrice],
  );

  const renderDomRows = useCallback(
    (rows: DomLevel[], side: 'bid' | 'ask', maxDepth: number) => {
      return rows.map((row) => {
        const depth = maxDepth > 0 ? Math.min(100, (row.cumulative / maxDepth) * 100) : 0;
        return (
          <button
            key={`${side}:${row.price}`}
            className="ghost"
            onClick={() => selectDomLevel(side, row.price)}
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8,
              width: '100%',
              padding: '3px 8px',
              overflow: 'hidden',
              borderRadius: 0,
              borderColor: 'transparent',
              textAlign: 'right',
            }}
          >
            <span
              style={{
                position: 'absolute',
                inset: 0,
                left: side === 'bid' ? `${100 - depth}%` : 0,
                right: side === 'ask' ? `${100 - depth}%` : 0,
                background: side === 'bid' ? 'rgba(38, 166, 154, .16)' : 'rgba(239, 83, 80, .16)',
              }}
            />
            <span
              className={side === 'bid' ? 'up mono' : 'down mono'}
              style={{ position: 'relative', textAlign: 'left' }}
            >
              {formatPrice(row.price)}
            </span>
            <span className="mono" style={{ position: 'relative' }}>
              {row.size.toFixed(2)}
            </span>
            <span className="mono muted" style={{ position: 'relative' }}>
              {row.cumulative.toFixed(2)}
            </span>
          </button>
        );
      });
    },
    [formatPrice, selectDomLevel],
  );

  if (!user) {
    return (
      <div className="page">
        <p>
          You need to <Link to="/login">log in</Link> to view charts.
        </p>
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
                <span className="mono">
                  {s.exchange}:{s.ticker}
                </span>
                <span className="muted small" style={{ marginLeft: 8 }}>
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const overlayIndicators = indicatorsQ.data?.indicators.filter((i) => i.overlay) ?? [];
  const book = domQ.data?.book;
  const maxDepth = Math.max(book?.bids.at(-1)?.cumulative ?? 0, book?.asks.at(-1)?.cumulative ?? 0);
  const selectedPaper = paperAccountsQ.data?.accounts.find(
    (account) => account.id === paperAccountId,
  );
  const selectedBroker = brokerConnectionsQ.data?.connections.find(
    (connection) => connection.id === brokerConnectionId,
  );

  return (
    <div className="chart-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', minWidth: 0, background: '#0e0e0e' }}
      />
      <aside
        className="col"
        style={{
          gridColumn: 2,
          gridRow: '1 / span 2',
          minHeight: 0,
          overflow: 'auto',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-2)',
          padding: 12,
        }}
      >
        <section className="col" style={{ gap: 8 }}>
          <div className="row">
            <div>
              <div style={{ fontWeight: 600 }}>DOM</div>
              <div className="muted small mono">
                {historyQ.data
                  ? `${historyQ.data.symbol.exchange}:${historyQ.data.symbol.ticker}`
                  : symbolId}
              </div>
            </div>
            <span className="grow" />
            {book && <span className="mono small">{formatPrice(book.mid)}</span>}
          </div>
          <div className="row small muted">
            <span>Price</span>
            <span className="grow" />
            <span>Size</span>
            <span style={{ width: 70, textAlign: 'right' }}>Cum</span>
          </div>
          <div style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}>
            {book ? (
              <>
                {renderDomRows([...book.asks].reverse(), 'ask', maxDepth)}
                <div
                  className="row mono small"
                  style={{
                    justifyContent: 'space-between',
                    padding: '5px 8px',
                    borderTop: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-3)',
                  }}
                >
                  <span>spread {formatPrice(book.spread)}</span>
                  <span className={book.imbalance >= 0 ? 'up' : 'down'}>
                    imbalance {(book.imbalance * 100).toFixed(1)}%
                  </span>
                </div>
                {renderDomRows(book.bids, 'bid', maxDepth)}
              </>
            ) : (
              <div className="muted small" style={{ padding: 12 }}>
                {domQ.isLoading ? 'Loading depth...' : 'Depth unavailable'}
              </div>
            )}
          </div>
        </section>

        <section className="card col" style={{ background: 'var(--bg)', gap: 10 }}>
          <div className="row">
            <button
              className={orderSide === 'buy' ? 'primary' : ''}
              onClick={() => setOrderSide('buy')}
            >
              Buy
            </button>
            <button
              className={orderSide === 'sell' ? 'primary' : ''}
              onClick={() => setOrderSide('sell')}
            >
              Sell
            </button>
            <span className="grow" />
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value as 'paper' | 'broker')}
              style={{ width: 104 }}
            >
              <option value="paper">Paper</option>
              <option value="broker">Broker</option>
            </select>
          </div>
          {destination === 'paper' ? (
            <div>
              <label>Paper account</label>
              <select value={paperAccountId} onChange={(e) => setPaperAccountId(e.target.value)}>
                <option value="">Select account</option>
                {paperAccountsQ.data?.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {Number(account.balance).toFixed(2)} {account.currency}
                  </option>
                ))}
              </select>
              {!paperAccountsQ.data?.accounts.length && (
                <Link className="small" to="/paper">
                  Create paper account
                </Link>
              )}
            </div>
          ) : (
            <div>
              <label>Broker connection</label>
              <select
                value={brokerConnectionId}
                onChange={(e) => setBrokerConnectionId(e.target.value)}
              >
                <option value="">Select broker</option>
                {brokerConnectionsQ.data?.connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.label ?? connection.broker} · {connection.status}
                  </option>
                ))}
              </select>
              {!brokerConnectionsQ.data?.connections.length && (
                <Link className="small" to="/brokers">
                  Connect broker
                </Link>
              )}
            </div>
          )}
          <div className="row">
            <div className="grow">
              <label>Type</label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as 'market' | 'limit')}
              >
                <option value="limit">Limit</option>
                <option value="market">Market</option>
              </select>
            </div>
            <div className="grow">
              <label>Qty</label>
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>
          {orderType === 'limit' && (
            <div>
              <label>Limit</label>
              <input
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={lastPrice ? formatPrice(lastPrice) : ''}
              />
            </div>
          )}
          <button
            className="primary"
            disabled={placeOrder.isPending || !symbolId}
            onClick={() => placeOrder.mutate()}
          >
            {orderSide === 'buy' ? 'Buy' : 'Sell'} {historyQ.data?.symbol.ticker ?? 'symbol'}
          </button>
          <div className="small muted">
            {destination === 'paper' && selectedPaper && `Paper: ${selectedPaper.name}`}
            {destination === 'broker' &&
              selectedBroker &&
              `Broker: ${selectedBroker.label ?? selectedBroker.broker}`}
            {lastPrice !== undefined && ` · ref ${formatPrice(lastPrice)}`}
          </div>
          {placeOrder.data && (
            <p className="up small" style={{ margin: 0 }}>
              Order submitted.
            </p>
          )}
          {placeOrder.error instanceof Error && (
            <p className="down small" style={{ margin: 0 }}>
              {placeOrder.error.message}
            </p>
          )}
        </section>

        {showChartPatterns && (
          <section className="col" style={{ gap: 8 }}>
            <div className="row">
              <div style={{ fontWeight: 600 }}>Chart Patterns</div>
              <span className="grow" />
              {chartPatternsQ.isFetching && <span className="muted small">scanning…</span>}
            </div>
            {chartPatternsQ.data && chartPatternsQ.data.matches.length === 0 && (
              <div className="muted small">No confirmed patterns in the last 500 bars.</div>
            )}
            <div className="col" style={{ gap: 6 }}>
              {chartPatternsQ.data?.matches
                .slice()
                .reverse()
                .slice(0, 12)
                .map((m) => (
                  <div
                    key={`${m.id}-${m.endIndex}`}
                    className="col"
                    style={{
                      gap: 2,
                      padding: '6px 8px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      borderLeft: `3px solid ${
                        m.direction === 'bullish'
                          ? '#26a69a'
                          : m.direction === 'bearish'
                            ? '#ef5350'
                            : '#b2b5be'
                      }`,
                    }}
                  >
                    <div className="row">
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</span>
                      <span className="grow" />
                      <span
                        className={
                          m.direction === 'bullish'
                            ? 'up small'
                            : m.direction === 'bearish'
                              ? 'down small'
                              : 'muted small'
                        }
                      >
                        {m.direction}
                      </span>
                    </div>
                    <div className="row muted small mono">
                      <span>{m.category}</span>
                      <span className="grow" />
                      <span>target {formatPrice(m.target)}</span>
                    </div>
                    <div className="row muted small">
                      <span>break {formatPrice(m.breakoutLevel)}</span>
                      <span className="grow" />
                      <span>conf {(m.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {showVolumeProfile && (
          <section className="col" style={{ gap: 8 }}>
            <div className="row">
              <div style={{ fontWeight: 600 }}>Volume Profile</div>
              <span className="grow" />
              {volumeProfileQ.isFetching && <span className="muted small">computing…</span>}
            </div>
            {volumeProfileQ.data && volumeProfileQ.data.profile.bins === 0 && (
              <div className="muted small">No volume in the last 500 bars.</div>
            )}
            {volumeProfileQ.data &&
              volumeProfileQ.data.profile.bins > 0 &&
              (() => {
                const p = volumeProfileQ.data.profile;
                const rowH = 9;
                const maxBarPx = 150;
                const maxVol = Math.max(...p.rows.map((r) => r.volume), 1);
                const display = p.rows.slice().reverse();
                const height = display.length * rowH;
                return (
                  <>
                    <div className="col" style={{ gap: 2 }}>
                      <div className="row small">
                        <span className="muted">POC</span>
                        <span className="grow" />
                        <span className="mono" style={{ color: '#f0b90b' }}>
                          {formatPrice(p.poc)}
                        </span>
                      </div>
                      <div className="row small">
                        <span className="muted">Value area</span>
                        <span className="grow" />
                        <span className="mono">
                          {formatPrice(p.val)} – {formatPrice(p.vah)}
                        </span>
                      </div>
                      <div className="row small">
                        <span className="muted">Total vol</span>
                        <span className="grow" />
                        <span className="mono">{formatVol(p.totalVolume)}</span>
                      </div>
                      <div className="row small">
                        <span className="muted">Delta</span>
                        <span className="grow" />
                        <span className={p.delta >= 0 ? 'up mono' : 'down mono'}>
                          {p.delta >= 0 ? '+' : '-'}
                          {formatVol(Math.abs(p.delta))}
                        </span>
                      </div>
                    </div>
                    <svg
                      width="100%"
                      height={height}
                      viewBox={`0 0 200 ${height}`}
                      preserveAspectRatio="none"
                      style={{ display: 'block' }}
                    >
                      {display.map((r, di) => {
                        const y = di * rowH;
                        const sellW = (r.sellVolume / maxVol) * maxBarPx;
                        const buyW = (r.buyVolume / maxVol) * maxBarPx;
                        return (
                          <g key={r.index}>
                            {r.inValueArea && (
                              <rect
                                x={0}
                                y={y}
                                width={200}
                                height={rowH}
                                fill="rgba(120,123,134,0.12)"
                              />
                            )}
                            <rect
                              x={0}
                              y={y + 0.5}
                              width={sellW}
                              height={rowH - 1}
                              fill="#ef5350"
                              opacity={r.isPoc ? 1 : 0.75}
                            />
                            <rect
                              x={sellW}
                              y={y + 0.5}
                              width={buyW}
                              height={rowH - 1}
                              fill="#26a69a"
                              opacity={r.isPoc ? 1 : 0.75}
                            />
                            {r.isPoc && (
                              <rect x={0} y={y} width={2.5} height={rowH} fill="#f0b90b" />
                            )}
                          </g>
                        );
                      })}
                    </svg>
                    <div className="row muted small">
                      <span>{formatVol(p.buyVolume)} buy</span>
                      <span className="grow" />
                      <span>
                        {p.bins} bins · {(p.valueAreaPct * 100).toFixed(0)}% VA
                      </span>
                    </div>
                  </>
                );
              })()}
          </section>
        )}
      </aside>
      <div className="chart-toolbar" style={{ flexWrap: 'wrap', gap: 8, gridColumn: 1 }}>
        <select
          value={interval}
          onChange={(e) => setInterval(e.target.value as Interval)}
          style={{ width: 80 }}
        >
          {INTERVALS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <span className="muted small">|</span>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addIndicator(e.target.value);
            e.target.value = '';
          }}
          style={{ width: 160 }}
        >
          <option value="">+ Add indicator…</option>
          {overlayIndicators.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        {activeIndicators.map((a) => {
          const def = indicatorsQ.data?.indicators.find((i) => i.id === a.id);
          return (
            <span
              key={a.id}
              className="row"
              style={{
                gap: 4,
                padding: '2px 8px',
                background: 'var(--bg-3)',
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              {def?.name ?? a.id}
              <button
                onClick={() => removeIndicator(a.id)}
                style={{ padding: '0 6px', fontSize: 12, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          );
        })}
        <span className="muted small">|</span>
        <button
          className={showPatterns ? 'primary' : ''}
          onClick={() => setShowPatterns((s) => !s)}
          style={{ fontSize: 12 }}
        >
          Patterns
          {showPatterns && patternsQ.data ? ` (${patternsQ.data.matches.length})` : ''}
        </button>
        {showPatterns && patternsQ.isFetching && <span className="muted small">scanning…</span>}
        <button
          className={showChartPatterns ? 'primary' : ''}
          onClick={() => setShowChartPatterns((s) => !s)}
          style={{ fontSize: 12 }}
        >
          Chart Patterns
          {showChartPatterns && chartPatternsQ.data
            ? ` (${chartPatternsQ.data.matches.length})`
            : ''}
        </button>
        {showChartPatterns && chartPatternsQ.isFetching && (
          <span className="muted small">scanning…</span>
        )}
        <button
          className={showVolumeProfile ? 'primary' : ''}
          onClick={() => setShowVolumeProfile((s) => !s)}
          style={{ fontSize: 12 }}
        >
          Volume Profile
        </button>
        {showVolumeProfile && volumeProfileQ.isFetching && (
          <span className="muted small">computing…</span>
        )}
        <span className="grow" />
        {historyQ.data && (
          <span className="mono small">
            {historyQ.data.symbol.exchange}:{historyQ.data.symbol.ticker} ·{' '}
            {historyQ.data.bars.length} bars · {activeIndicators.length} indicators
          </span>
        )}
        {historyQ.isFetching && <span className="muted small">refreshing…</span>}
        <Link to="/" className="muted small">
          home
        </Link>
      </div>
    </div>
  );
}
