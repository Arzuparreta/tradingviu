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
  removeChart,
  darkTheme,
} from '@tv/chart-engine';
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';
import type { DomLevel } from '../api/types';

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, tenant } = useAuth();
  const params = useParams<{ symbol?: string }>();
  const symbolId = params.symbol;
  const [interval, setInterval] = useState<Interval>('1h');
  const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig[]>([]);
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
