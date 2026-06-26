import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';
import {
  createTvChart,
  addSeries,
  setData,
  update,
  createMarkers,
  removeChart,
  darkTheme,
  subscribeVisibleTimeRange,
  createIchimokuCloud,
  type IchimokuCloudHandle,
} from '@tv/chart-engine';
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  MouseEventParams,
  SeriesMarker,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import type { DomLevel, StrategyType, OptimizeObjective, PivotMethod, PivotPeriod } from '../api/types';
import { useChartHistory } from '../hooks/use-chart-history';
import { useBarStream, type StreamStatus } from '../hooks/use-bar-stream';
import { useMarketStream } from '../hooks/use-market-stream';
import { useDrawings } from '../hooks/use-drawings';
import { DrawingOverlay } from '../components/DrawingOverlay';
import { DrawingToolbar } from '../components/DrawingToolbar';
import { DEFAULT_DRAWING_STYLE, type DrawingStyle, type DrawingTool } from '@tv/drawing-tools';
import {
  REPLAY_SPEEDS,
  replayStepMs,
  clampIndex,
  defaultReplayIndex,
  isReplayAtEnd,
  indexAtOrBefore,
} from '../lib/replay';

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
  const tpoLinesRef = useRef<IPriceLine[]>([]);
  const pivotLinesRef = useRef<IPriceLine[]>([]);
  const ichimokuSeriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const ichimokuCloudRef = useRef<IchimokuCloudHandle | null>(null);
  const backtestMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
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
  const [showTpo, setShowTpo] = useState(false);
  const [showPivots, setShowPivots] = useState(false);
  const [pivotMethod, setPivotMethod] = useState<PivotMethod>('standard');
  const [pivotPeriod, setPivotPeriod] = useState<PivotPeriod>('D');
  const [showIchimoku, setShowIchimoku] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const [strategyType, setStrategyType] = useState<StrategyType>('maCross');
  const [strategyParams, setStrategyParams] = useState<Record<string, number>>({
    fast: 10,
    slow: 30,
  });
  const [btSettings, setBtSettings] = useState({
    initialCapital: 10_000,
    feeBps: 5,
    slippageBps: 2,
    allowShort: false,
    positionPct: 1,
  });
  const [optimizeObjective, setOptimizeObjective] = useState<OptimizeObjective>('netProfitPct');
  const [replayActive, setReplayActive] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [destination, setDestination] = useState<'paper' | 'broker'>('paper');
  const [paperAccountId, setPaperAccountId] = useState('');
  const [brokerConnectionId, setBrokerConnectionId] = useState('');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('limit');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');

  // Drawing tools: a draw-mode toggle reveals the toolbar and lets the overlay
  // capture pointer events; otherwise drawings render but the chart stays
  // interactive. `chartReady` mirrors the chart/series refs into render so the
  // overlay can pick them up (refs alone don't trigger a re-render).
  const [drawMode, setDrawMode] = useState(false);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('trend-line');
  const [drawingStyle, setDrawingStyle] = useState<DrawingStyle>(DEFAULT_DRAWING_STYLE);
  const [deleteDrawingRequest, setDeleteDrawingRequest] = useState(0);
  const [chartReady, setChartReady] = useState(false);
  const { drawings, setDrawings } = useDrawings({
    symbolId: symbolId ?? null,
    interval,
    enabled: !!user,
  });

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

  const historyQ = useChartHistory({ symbolId: symbolId ?? null, interval, pageSize: 500 });
  const symbolInfo = historyQ.symbol;
  // Only enable the bar stream when the fetched symbol matches the URL param.
  // Prevents writing stale bars of the previous symbol to the new chart during
  // a symbol/interval switch.
  // The live stream and replay are mutually exclusive: replay owns the candle
  // series while active, so we pause streaming to avoid future bars leaking in.
  const streamEnabled = !!symbolId && symbolInfo?.id === symbolId && !replayActive;
  const streamExchange = streamEnabled ? (symbolInfo?.exchange ?? '') : '';
  const streamTicker = streamEnabled ? (symbolInfo?.ticker ?? '') : '';

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

  const tpoQ = useQuery({
    queryKey: ['tpo-profile', symbolId, interval],
    queryFn: () => api.tpoProfile(symbolId!, interval, 240, 24, 10),
    enabled: !!symbolId && showTpo,
    staleTime: 30_000,
  });

  const ichimokuQ = useQuery({
    queryKey: ['ichimoku', symbolId, interval],
    queryFn: () => api.ichimoku(symbolId!, interval, 500),
    enabled: !!symbolId && showIchimoku,
    staleTime: 30_000,
  });

  const pivotsQ = useQuery({
    queryKey: ['pivot-points', symbolId, interval, pivotMethod, pivotPeriod],
    queryFn: () => api.pivotPoints(symbolId!, interval, pivotMethod, pivotPeriod, 500),
    enabled: !!symbolId && showPivots,
    staleTime: 30_000,
  });

  const strategiesQ = useQuery({
    queryKey: ['backtest-strategies'],
    queryFn: () => api.backtestStrategies(),
    enabled: showBacktest,
    staleTime: Infinity,
  });
  const currentStrategy = strategiesQ.data?.strategies.find((s) => s.type === strategyType);
  const backtestM = useMutation({
    mutationFn: () => {
      if (!symbolId) throw new Error('Symbol is required');
      return api.backtest(
        symbolId,
        interval,
        { type: strategyType, params: strategyParams },
        btSettings,
        1000,
      );
    },
  });
  const selectStrategy = (type: StrategyType) => {
    setStrategyType(type);
    const def = strategiesQ.data?.strategies.find((s) => s.type === type);
    if (def) setStrategyParams(Object.fromEntries(def.params.map((p) => [p.key, p.default])));
  };
  // Coarse grid for optimization: ~7 evenly-spaced values per param, snapped.
  const buildParamGrid = (): Record<string, number[]> => {
    const grid: Record<string, number[]> = {};
    for (const p of currentStrategy?.params ?? []) {
      const count = 7;
      const vals: number[] = [];
      for (let i = 0; i < count; i++) {
        const raw = p.min + ((p.max - p.min) * i) / (count - 1);
        const snapped = p.step >= 1 ? Math.round(raw / p.step) * p.step : raw;
        vals.push(Math.round(snapped * 1e6) / 1e6);
      }
      grid[p.key] = [...new Set(vals)];
    }
    return grid;
  };
  const optimizeM = useMutation({
    mutationFn: () => {
      if (!symbolId) throw new Error('Symbol is required');
      return api.backtestOptimize(
        symbolId,
        interval,
        strategyType,
        buildParamGrid(),
        btSettings,
        optimizeObjective,
        1000,
      );
    },
  });
  const walkForwardM = useMutation({
    mutationFn: () => {
      if (!symbolId) throw new Error('Symbol is required');
      return api.backtestWalkForward(
        symbolId,
        interval,
        strategyType,
        buildParamGrid(),
        btSettings,
        optimizeObjective,
        300,
        100,
        1500,
      );
    },
  });

  const domQ = useQuery({
    queryKey: ['dom', symbolId],
    queryFn: () => api.dom(symbolId!, 16),
    enabled: !!symbolId,
    staleTime: 30_000,
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

  const market = useMarketStream({
    symbolId: streamEnabled ? symbolId : null,
    exchange: streamExchange,
    ticker: streamTicker,
  });
  const liveBook = market.book ?? domQ.data?.book;
  const lastPrice =
    market.quote ? (market.quote.bid + market.quote.ask) / 2 : liveBook?.mid ?? historyQ.bars.at(-1)?.close;

  // Bars actually drawn on the chart. In replay we reveal only bars up to the
  // cursor; otherwise we render the full loaded history (same array identity, so
  // downstream effects don't re-run on every replay tick when replay is off).
  const visibleBars = useMemo(
    () => (replayActive ? historyQ.bars.slice(0, replayIndex + 1) : historyQ.bars),
    [historyQ.bars, replayActive, replayIndex],
  );
  // Time cutoff for time-keyed overlays (indicators, pattern markers). Causal
  // indicators are unchanged by future bars, so filtering precomputed series by
  // `time <= cutoff` is exactly their value "as of" the replay cursor.
  const replayCutoff = replayActive ? (historyQ.bars[replayIndex]?.time ?? null) : null;
  const replayActiveRef = useRef(replayActive);
  replayActiveRef.current = replayActive;

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
      const ticker = symbolInfo?.ticker ?? domQ.data?.symbol.ticker;
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
    // NOTE: deps include [user, symbolId] on purpose. The component has
    // early returns for !user / !symbolId *after* all the hooks. On
    // client-side navigation from /, the first render sees user=null
    // (bootstrap in flight) → early return → containerRef.current is
    // null → this effect's first run does nothing. Once user lands, the
    // component re-renders past the early return, the div with the ref
    // mounts, and *this* deps change re-runs the effect with a live ref.
    // If deps were [] we'd be stuck in the first-run state forever.
    if (!user || !symbolId) return;
    if (!containerRef.current) return;
    const chart = createTvChart({ container: containerRef.current, theme: darkTheme });
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
    isFirstSetDataRef.current = true;
    setChartReady(true);
    return () => {
      setChartReady(false);
      removeChart(chart);
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      markersRef.current = null;
      backtestMarkersRef.current = null;
      chartPatternSeriesRef.current = [];
      volumeProfileLinesRef.current = [];
      tpoLinesRef.current = [];
      pivotLinesRef.current = [];
      ichimokuSeriesRef.current = [];
      ichimokuCloudRef.current = null;
      indicatorSeriesRef.current.clear();
      indicatorBandSeriesRef.current.clear();
    };
  }, [user, symbolId]);

  const isFirstSetDataRef = useRef(true);

  // Push the latest bars into the existing series. We do NOT recreate the
  // series here so the user's pan/zoom, markers, and price lines are
  // preserved. fitContent runs only on the first load per symbol/interval.
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current || visibleBars.length === 0) return;
    setData(
      candleRef.current,
      visibleBars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    setData(
      volumeRef.current,
      visibleBars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
      })),
    );
    if (isFirstSetDataRef.current) {
      chartRef.current?.timeScale().fitContent();
      isFirstSetDataRef.current = false;
    } else if (replayActive) {
      // Follow the replay edge so the newest revealed bar stays at the right.
      chartRef.current?.timeScale().scrollToRealTime();
    }
  }, [visibleBars, replayActive]);

  useEffect(() => {
    if (!candleRef.current) return;
    if (!markersRef.current) {
      markersRef.current = createMarkers(candleRef.current, []);
    }
    if (!showPatterns || !patternsQ.data) {
      markersRef.current.setMarkers([]);
      return;
    }
    const visibleMatches =
      replayCutoff == null
        ? patternsQ.data.matches
        : patternsQ.data.matches.filter((m) => m.time <= replayCutoff);
    const markers: SeriesMarker<Time>[] = visibleMatches.map((m) => {
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
  }, [patternsQ.data, showPatterns, historyQ.bars, replayCutoff]);

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
    // In replay, only show patterns whose structure is fully formed by the cursor.
    const visibleMatches =
      replayCutoff == null
        ? chartPatternsQ.data.matches
        : chartPatternsQ.data.matches.filter((m) => {
            const last = m.points[m.points.length - 1];
            return last != null && last.time <= replayCutoff;
          });
    for (const m of visibleMatches.slice(0, 12)) {
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
  }, [chartPatternsQ.data, showChartPatterns, historyQ.bars, replayCutoff]);

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
  }, [volumeProfileQ.data, showVolumeProfile, historyQ.bars]);

  // TPO profile: overlay the Point of Control, value-area bounds, and the
  // Initial Balance high/low as horizontal price lines on the candle series.
  // Rebuilt whenever the data, the toggle, or the candles change.
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    for (const line of tpoLinesRef.current) {
      try {
        candle.removePriceLine(line);
      } catch {
        // candle series was recreated; the old handles are already gone
      }
    }
    tpoLinesRef.current = [];
    if (!showTpo || !tpoQ.data) return;
    const p = tpoQ.data.profile;
    if (p.bins === 0) return;
    tpoLinesRef.current = [
      candle.createPriceLine({
        price: p.poc,
        color: '#26c6da',
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
      candle.createPriceLine({
        price: p.initialBalanceHigh,
        color: '#5c6bc0',
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true,
        title: 'IBH',
      }),
      candle.createPriceLine({
        price: p.initialBalanceLow,
        color: '#5c6bc0',
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true,
        title: 'IBL',
      }),
    ];
  }, [tpoQ.data, showTpo, historyQ.bars]);

  // Pivot Points: draw the latest period's levels as horizontal price lines on
  // the candle series (PP amber, resistances red, supports green).
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    for (const line of pivotLinesRef.current) {
      try {
        candle.removePriceLine(line);
      } catch {
        // candle series was recreated; the old handles are already gone
      }
    }
    pivotLinesRef.current = [];
    if (!showPivots || !pivotsQ.data?.pivots.latest) return;
    const colorFor = (name: string): string =>
      name === 'PP' ? '#f0b90b' : name.startsWith('R') ? '#ef5350' : '#26a69a';
    pivotLinesRef.current = pivotsQ.data.pivots.latest.levels.map((lv) =>
      candle.createPriceLine({
        price: lv.value,
        color: colorFor(lv.name),
        lineWidth: lv.name === 'PP' ? 2 : 1,
        lineStyle: lv.name === 'PP' ? 0 : 2,
        axisLabelVisible: true,
        title: lv.name,
      }),
    );
  }, [pivotsQ.data, showPivots, historyQ.bars]);

  // Ichimoku: five line series (Tenkan, Kijun, Senkou A/B, Chikou) plus the
  // kumo cloud primitive between the spans. Senkou spans carry forward-displaced
  // times so the scale resolves them; the cloud attaches to the candle series.
  // In replay every series is clipped to the cursor time.
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle) return;

    for (const s of ichimokuSeriesRef.current) {
      try {
        chart.removeSeries(s);
      } catch {
        // series already detached with the candle series; ignore
      }
    }
    ichimokuSeriesRef.current = [];
    if (ichimokuCloudRef.current) {
      ichimokuCloudRef.current.remove();
      ichimokuCloudRef.current = null;
    }
    if (!showIchimoku || !ichimokuQ.data) return;

    const ich = ichimokuQ.data.ichimoku;
    const passCut = (t: number) => replayCutoff == null || t <= replayCutoff;
    const mk = (color: string, points: { time: number; value: number }[]) => {
      const s = addSeries(chart, 'line', {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(
        points
          .filter((p) => passCut(p.time))
          .map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      ichimokuSeriesRef.current.push(s);
    };

    mk('#3b82f6', ich.tenkan); // Tenkan-sen
    mk('#f97316', ich.kijun); // Kijun-sen
    mk('#10b981', ich.senkouA); // Senkou Span A
    mk('#ef5350', ich.senkouB); // Senkou Span B
    mk('#a855f7', ich.chikou); // Chikou Span

    const handle = createIchimokuCloud(candle);
    handle.setData(
      ich.cloud
        .filter((c) => passCut(c.time))
        .map((c) => ({ time: c.time, spanA: c.spanA, spanB: c.spanB })),
    );
    ichimokuCloudRef.current = handle;
  }, [ichimokuQ.data, showIchimoku, historyQ.bars, replayCutoff]);

  // Backtest: entry/exit markers on the candle series (separate markers plugin
  // from the candlestick-pattern overlay). Clipped to the cursor in replay.
  useEffect(() => {
    if (!candleRef.current) return;
    if (!backtestMarkersRef.current) {
      backtestMarkersRef.current = createMarkers(candleRef.current, []);
    }
    if (!showBacktest || !backtestM.data) {
      backtestMarkersRef.current.setMarkers([]);
      return;
    }
    const markers: SeriesMarker<Time>[] = [];
    for (const tr of backtestM.data.result.trades) {
      if (replayCutoff == null || tr.entryTime <= replayCutoff) {
        markers.push({
          time: tr.entryTime as UTCTimestamp,
          position: tr.side === 'long' ? 'belowBar' : 'aboveBar',
          color: tr.side === 'long' ? '#26a69a' : '#ef5350',
          shape: tr.side === 'long' ? 'arrowUp' : 'arrowDown',
          text: tr.side === 'long' ? 'L' : 'S',
        });
      }
      if (replayCutoff == null || tr.exitTime <= replayCutoff) {
        markers.push({
          time: tr.exitTime as UTCTimestamp,
          position: 'aboveBar',
          color: tr.pnl >= 0 ? '#26a69a' : '#ef5350',
          shape: 'circle',
          text: `${tr.pnl >= 0 ? '+' : ''}${(tr.pnlPct * 100).toFixed(1)}%`,
        });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    backtestMarkersRef.current.setMarkers(markers);
  }, [backtestM.data, showBacktest, historyQ.bars, replayCutoff]);

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
    if (!chartRef.current || historyQ.bars.length === 0) return;
    // In replay, clip causal indicator series to the cursor's time.
    const passCut = (t: number) => replayCutoff == null || t <= replayCutoff;
    for (let i = 0; i < indicatorQueries.length; i++) {
      const q = indicatorQueries[i];
      const ind = activeIndicators[i];
      if (!q?.data || !ind) continue;
      const out = q.data.output;
      if (out.overlay) {
        const points = (out.points as ReadonlyArray<{ time: number }>).filter((p) =>
          passCut(p.time),
        );
        for (const line of out.lines) {
          const key = `${ind.id}:${line.key}`;
          let s = indicatorSeriesRef.current.get(key);
          if (!s) {
            s = addSeries(chartRef.current, 'line');
            indicatorSeriesRef.current.set(key, s);
          }
          setData(s, points as never);
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
            out.bands
              .filter((b: { time: number }) => passCut(b.time))
              .map((b: { time: number; upper: number }) => ({
                time: b.time as UTCTimestamp,
                value: b.upper,
              })),
          );
          setData(
            band.middle,
            out.bands
              .filter((b: { time: number }) => passCut(b.time))
              .map((b: { time: number; middle: number }) => ({
                time: b.time as UTCTimestamp,
                value: b.middle,
              })),
          );
          setData(
            band.lower,
            out.bands
              .filter((b: { time: number }) => passCut(b.time))
              .map((b: { time: number; lower: number }) => ({
                time: b.time as UTCTimestamp,
                value: b.lower,
              })),
          );
        }
      }
    }
  }, [indicatorQueries, historyQ.bars, replayCutoff]);

  // Paginated history: when the user scrolls into the empty zone on the left,
  // pull more bars. We trigger `loadMore` when the visible-range's left edge
  // is within ~5 bars of the loaded buffer's leftmost time. We read the
  // latest hook state via refs so the subscription isn't torn down on every
  // render.
  const historyQRef = useRef(historyQ);
  historyQRef.current = historyQ;
  const intervalSec = (() => {
    const map: Record<string, number> = {
      '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
      '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800,
    };
    return map[interval] ?? 60;
  })();
  const stream = useBarStream({
    symbolId: streamEnabled ? symbolId : null,
    exchange: streamExchange,
    ticker: streamTicker,
    interval,
    onBar: (bar) => {
      const hq = historyQRef.current;
      const latest = hq.bars.at(-1);
      if (latest && bar.time > latest.time + Math.floor(intervalSec * 1.5)) {
        void hq.loadNewer(latest.time).finally(() => hq.upsertBar(bar));
        return;
      }
      hq.upsertBar(bar);
    },
  });
  const streamStatus = stream.status;
  const triggerZone = 5 * intervalSec;
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const unsub = subscribeVisibleTimeRange(chart, (range) => {
      if (!range || !range.from) return;
      // Replay owns the visible window; don't paginate while it's active.
      if (replayActiveRef.current) return;
      const from = typeof range.from === 'number' ? range.from : Number(range.from);
      const hq = historyQRef.current;
      const earliest = hq.bars[0]?.time;
      if (earliest === undefined) return;
      if (from - earliest < triggerZone && hq.hasMore && !hq.isLoadingMore) {
        void hq.loadMore();
      }
    });
    return () => unsub();
  }, [interval, triggerZone]);

  // --- Bar Replay ---------------------------------------------------------
  // Switching symbol/interval reloads history; leave replay so indices stay valid.
  useEffect(() => {
    setReplayActive(false);
    setReplayPlaying(false);
  }, [symbolId, interval]);

  // Auto-advance the cursor while playing; cadence is the speed multiplier.
  // (Note: `setInterval` is shadowed by the timeframe state setter — use window.)
  useEffect(() => {
    if (!replayActive || !replayPlaying) return;
    const id = window.setInterval(() => {
      setReplayIndex((i) => clampIndex(i + 1, historyQRef.current.bars.length));
    }, replayStepMs(replaySpeed));
    return () => window.clearInterval(id);
  }, [replayActive, replayPlaying, replaySpeed]);

  // Stop playback once the cursor reaches the final loaded bar.
  useEffect(() => {
    if (replayPlaying && isReplayAtEnd(replayIndex, historyQ.bars.length)) {
      setReplayPlaying(false);
    }
  }, [replayPlaying, replayIndex, historyQ.bars.length]);

  // Click a bar to set the replay start point (TradingView-style).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !replayActive) return;
    const handler = (param: MouseEventParams) => {
      if (param.time == null) return;
      const time = typeof param.time === 'number' ? param.time : Number(param.time);
      if (!Number.isFinite(time)) return;
      const idx = indexAtOrBefore(
        historyQRef.current.bars.map((b) => b.time),
        time,
      );
      if (idx >= 0) {
        setReplayPlaying(false);
        setReplayIndex(idx);
      }
    };
    chart.subscribeClick(handler);
    return () => chart.unsubscribeClick(handler);
  }, [replayActive]);

  const enterReplay = () => {
    setReplayIndex(defaultReplayIndex(historyQ.bars.length));
    setReplayPlaying(false);
    setReplayActive(true);
  };
  const exitReplay = () => {
    setReplayActive(false);
    setReplayPlaying(false);
  };
  const replayStepForward = () => {
    setReplayPlaying(false);
    setReplayIndex((i) => clampIndex(i + 1, historyQ.bars.length));
  };
  const replayStepBack = () => {
    setReplayPlaying(false);
    setReplayIndex((i) => clampIndex(i - 1, historyQ.bars.length));
  };
  const replayTogglePlay = () => {
    if (!replayPlaying && isReplayAtEnd(replayIndex, historyQ.bars.length)) {
      setReplayIndex(defaultReplayIndex(historyQ.bars.length));
    }
    setReplayPlaying((p) => !p);
  };

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
    const tickSize = liveBook?.tickSize ?? 0.01;
    const decimals = Math.min(8, Math.max(2, Math.ceil(Math.log10(1 / tickSize))));
    return price.toFixed(decimals);
  },
    [liveBook?.tickSize],
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
  const book = liveBook;
  const maxDepth = Math.max(book?.bids.at(-1)?.cumulative ?? 0, book?.asks.at(-1)?.cumulative ?? 0);
  const selectedPaper = paperAccountsQ.data?.accounts.find(
    (account) => account.id === paperAccountId,
  );
  const selectedBroker = brokerConnectionsQ.data?.connections.find(
    (connection) => connection.id === brokerConnectionId,
  );

  return (
    <div className="chart-layout" style={{ gridTemplateColumns: 'minmax(320px, 1fr) 340px' }}>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          minWidth: 200,
          minHeight: 200,
          background: '#0e0e0e',
        }}
      >
        <DrawingOverlay
          chart={chartReady ? chartRef.current : null}
          series={chartReady ? candleRef.current : null}
          drawings={drawings}
          tool={drawingTool}
          style={drawingStyle}
          active={drawMode && !replayActive}
          deleteRequest={deleteDrawingRequest}
          onChange={setDrawings}
        />
      </div>
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
                {symbolInfo
                  ? `${symbolInfo.exchange}:${symbolInfo.ticker}`
                  : symbolId}
              </div>
              <div className="muted small">
                {market.status === 'live' ? 'live depth' : market.status === 'idle' ? 'snapshot' : market.status}
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
            {orderSide === 'buy' ? 'Buy' : 'Sell'} {symbolInfo?.ticker ?? 'symbol'}
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

        {showTpo && (
          <section className="col" style={{ gap: 8 }}>
            <div className="row">
              <div style={{ fontWeight: 600 }}>TPO Profile</div>
              <span className="grow" />
              {tpoQ.isFetching && <span className="muted small">computing…</span>}
            </div>
            {tpoQ.data && tpoQ.data.profile.bins === 0 && (
              <div className="muted small">No data in the last 240 bars.</div>
            )}
            {tpoQ.data &&
              tpoQ.data.profile.bins > 0 &&
              (() => {
                const p = tpoQ.data.profile;
                const display = p.rows.slice().reverse();
                return (
                  <>
                    <div className="col" style={{ gap: 2 }}>
                      <div className="row small">
                        <span className="muted">POC</span>
                        <span className="grow" />
                        <span className="mono" style={{ color: '#26c6da' }}>
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
                        <span className="muted">Initial balance</span>
                        <span className="grow" />
                        <span className="mono" style={{ color: '#5c6bc0' }}>
                          {formatPrice(p.initialBalanceLow)} – {formatPrice(p.initialBalanceHigh)}
                        </span>
                      </div>
                      <div className="row small">
                        <span className="muted">Single prints</span>
                        <span className="grow" />
                        <span className="mono">{p.singlePrintCount}</span>
                      </div>
                    </div>
                    <div
                      className="col mono"
                      style={{ gap: 0, fontSize: 11, lineHeight: '13px' }}
                    >
                      {display.map((r) => (
                        <div
                          key={r.index}
                          className="row"
                          style={{
                            gap: 6,
                            padding: '0 2px',
                            background: r.inValueArea ? 'rgba(38,198,218,0.10)' : 'transparent',
                          }}
                        >
                          <span
                            style={{
                              width: 56,
                              flexShrink: 0,
                              textAlign: 'right',
                              color: r.isPoc ? '#26c6da' : '#787b86',
                            }}
                          >
                            {formatPrice(r.priceMid)}
                          </span>
                          <span
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: r.isPoc
                                ? '#26c6da'
                                : r.isSinglePrint
                                  ? '#ef9a3d'
                                  : '#d1d4dc',
                            }}
                          >
                            {r.letters || '·'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="row muted small">
                      <span>{p.periodCount} periods</span>
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

        {showPivots && (
          <section className="col" style={{ gap: 6 }}>
            <div className="row">
              <div style={{ fontWeight: 600 }}>Pivot Points</div>
              <span className="grow" />
              {pivotsQ.isFetching && <span className="muted small">computing…</span>}
            </div>
            {pivotsQ.data && !pivotsQ.data.pivots.latest && (
              <div className="muted small">Not enough history for a {pivotPeriod} pivot.</div>
            )}
            {pivotsQ.data?.pivots.latest &&
              (() => {
                const s = pivotsQ.data!.pivots.latest!;
                const colorFor = (name: string) =>
                  name === 'PP' ? '#f0b90b' : name.startsWith('R') ? '#ef5350' : '#26a69a';
                // Highest level first for a top-down ladder.
                const rows = s.levels.slice().sort((a, b) => b.value - a.value);
                return (
                  <>
                    <div className="col" style={{ gap: 1 }}>
                      {rows.map((lv) => (
                        <div key={lv.name} className="row small">
                          <span className="mono" style={{ color: colorFor(lv.name), width: 34 }}>
                            {lv.name}
                          </span>
                          <span className="grow" />
                          <span className="mono">{formatPrice(lv.value)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="row muted small">
                      <span>prior {pivotPeriod}</span>
                      <span className="grow" />
                      <span className="mono">
                        H {formatPrice(s.basisHigh)} · L {formatPrice(s.basisLow)} · C{' '}
                        {formatPrice(s.basisClose)}
                      </span>
                    </div>
                  </>
                );
              })()}
          </section>
        )}

        {showBacktest && (
          <section className="col" style={{ gap: 6 }}>
            <div className="row">
              <div style={{ fontWeight: 600 }}>Backtest</div>
              <span className="grow" />
              {backtestM.isPending && <span className="muted small">running…</span>}
            </div>

            <select
              value={strategyType}
              onChange={(e) => selectStrategy(e.target.value as StrategyType)}
            >
              {(strategiesQ.data?.strategies ?? []).map((s) => (
                <option key={s.type} value={s.type}>
                  {s.label}
                </option>
              ))}
            </select>
            {currentStrategy && <div className="muted small">{currentStrategy.description}</div>}

            {currentStrategy?.params.map((p) => (
              <div key={p.key} className="row small" style={{ gap: 6 }}>
                <span className="muted" style={{ width: 120 }}>
                  {p.label}
                </span>
                <span className="grow" />
                <input
                  type="number"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={strategyParams[p.key] ?? p.default}
                  onChange={(e) =>
                    setStrategyParams((sp) => ({ ...sp, [p.key]: Number(e.target.value) }))
                  }
                  style={{ width: 84 }}
                />
              </div>
            ))}

            {(
              [
                ['initialCapital', 'Capital', 1],
                ['feeBps', 'Fee (bps)', 1],
                ['slippageBps', 'Slippage (bps)', 1],
                ['positionPct', 'Position size', 0.05],
              ] as const
            ).map(([key, label, step]) => (
              <div key={key} className="row small" style={{ gap: 6 }}>
                <span className="muted" style={{ width: 120 }}>
                  {label}
                </span>
                <span className="grow" />
                <input
                  type="number"
                  step={step}
                  value={btSettings[key]}
                  onChange={(e) =>
                    setBtSettings((s) => ({ ...s, [key]: Number(e.target.value) }))
                  }
                  style={{ width: 84 }}
                />
              </div>
            ))}
            <label className="row small" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={btSettings.allowShort}
                onChange={(e) => setBtSettings((s) => ({ ...s, allowShort: e.target.checked }))}
              />
              Allow shorts
            </label>

            <button
              className="primary"
              onClick={() => backtestM.mutate()}
              disabled={!symbolId || backtestM.isPending}
              style={{ fontSize: 12 }}
            >
              Run backtest
            </button>
            {backtestM.isError && <div className="down small">Backtest failed.</div>}

            {backtestM.data &&
              (() => {
                const st = backtestM.data.result.stats;
                const eq = backtestM.data.result.equityCurve;
                const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
                const minE = Math.min(st.initialCapital, ...eq.map((p) => p.equity));
                const maxE = Math.max(st.initialCapital, ...eq.map((p) => p.equity));
                const W = 200;
                const H = 64;
                const x = (i: number) => (eq.length > 1 ? (i / (eq.length - 1)) * W : 0);
                const y = (e: number) => (maxE > minE ? H - ((e - minE) / (maxE - minE)) * H : H / 2);
                const path = eq
                  .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`)
                  .join(' ');
                const up = st.netProfit >= 0;
                const stat = (label: string, value: string, cls = '') => (
                  <div className="row small">
                    <span className="muted">{label}</span>
                    <span className="grow" />
                    <span className={`mono ${cls}`}>{value}</span>
                  </div>
                );
                return (
                  <>
                    <svg
                      width="100%"
                      height={H}
                      viewBox={`0 0 ${W} ${H}`}
                      preserveAspectRatio="none"
                      style={{ display: 'block', marginTop: 4 }}
                    >
                      <line
                        x1={0}
                        x2={W}
                        y1={y(st.initialCapital)}
                        y2={y(st.initialCapital)}
                        stroke="#787b86"
                        strokeWidth={0.5}
                        strokeDasharray="3 3"
                      />
                      <path d={path} fill="none" stroke={up ? '#26a69a' : '#ef5350'} strokeWidth={1.5} />
                    </svg>
                    {stat('Net profit', pct(st.netProfitPct), up ? 'up' : 'down')}
                    {stat('Buy & hold', pct(st.buyHoldReturnPct))}
                    {stat('Trades', `${st.totalTrades} (${st.winningTrades}/${st.losingTrades})`)}
                    {stat('Win rate', `${(st.winRate * 100).toFixed(0)}%`)}
                    {stat(
                      'Profit factor',
                      st.profitFactor == null ? '∞' : st.profitFactor.toFixed(2),
                    )}
                    {stat('Max drawdown', `-${(st.maxDrawdownPct * 100).toFixed(1)}%`, 'down')}
                    {stat('Sharpe (bar)', st.sharpe.toFixed(2))}
                    {stat('Exposure', `${(st.exposurePct * 100).toFixed(0)}%`)}
                  </>
                );
              })()}

            <div className="row small" style={{ gap: 6, marginTop: 4 }}>
              <span className="muted">Optimize by</span>
              <span className="grow" />
              <select
                value={optimizeObjective}
                onChange={(e) => setOptimizeObjective(e.target.value as OptimizeObjective)}
                style={{ width: 120 }}
              >
                <option value="netProfitPct">Net profit</option>
                <option value="sharpe">Sharpe</option>
                <option value="profitFactor">Profit factor</option>
                <option value="winRate">Win rate</option>
                <option value="maxDrawdownPct">Min drawdown</option>
              </select>
            </div>
            <button
              onClick={() => optimizeM.mutate()}
              disabled={!symbolId || optimizeM.isPending}
              style={{ fontSize: 12 }}
            >
              {optimizeM.isPending ? 'Optimizing…' : 'Optimize parameters'}
            </button>
            {optimizeM.isError && <div className="down small">Optimization failed.</div>}
            {optimizeM.data &&
              (() => {
                const opt = optimizeM.data.optimization;
                const keys = currentStrategy?.params.map((p) => p.key) ?? [];
                return (
                  <>
                    <div className="muted small">
                      {opt.evaluated} combos{opt.truncated ? ' (capped)' : ''} · top{' '}
                      {Math.min(12, opt.results.length)} · click to apply
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="discovery-table" style={{ minWidth: 0, fontSize: 11 }}>
                        <thead>
                          <tr>
                            {keys.map((k) => (
                              <th key={k}>{k}</th>
                            ))}
                            <th>Net</th>
                            <th>Win</th>
                            <th>PF</th>
                            <th>DD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {opt.results.slice(0, 12).map((r, i) => (
                            <tr
                              key={i}
                              style={{ cursor: 'pointer' }}
                              onClick={() => setStrategyParams(r.params)}
                              title="Apply these parameters"
                            >
                              {keys.map((k) => (
                                <td key={k} className="mono">
                                  {r.params[k]}
                                </td>
                              ))}
                              <td className={`mono ${r.stats.netProfitPct >= 0 ? 'up' : 'down'}`}>
                                {(r.stats.netProfitPct * 100).toFixed(1)}%
                              </td>
                              <td className="mono">{(r.stats.winRate * 100).toFixed(0)}%</td>
                              <td className="mono">
                                {r.stats.profitFactor == null
                                  ? '∞'
                                  : r.stats.profitFactor.toFixed(2)}
                              </td>
                              <td className="mono down">
                                -{(r.stats.maxDrawdownPct * 100).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}

            <button
              onClick={() => walkForwardM.mutate()}
              disabled={!symbolId || walkForwardM.isPending}
              style={{ fontSize: 12, marginTop: 4 }}
              title="Rolling in-sample optimize → out-of-sample test (anti-overfitting)"
            >
              {walkForwardM.isPending ? 'Walk-forward…' : 'Walk-forward'}
            </button>
            {walkForwardM.isError && <div className="down small">Walk-forward failed.</div>}
            {walkForwardM.data &&
              (() => {
                const wf = walkForwardM.data.walkForward;
                const ag = wf.aggregate;
                const keys = currentStrategy?.params.map((p) => p.key) ?? [];
                if (ag.foldCount === 0)
                  return <div className="muted small">Not enough history for a fold.</div>;
                const stat = (label: string, value: string, cls = '') => (
                  <div className="row small">
                    <span className="muted">{label}</span>
                    <span className="grow" />
                    <span className={`mono ${cls}`}>{value}</span>
                  </div>
                );
                return (
                  <>
                    <div className="col" style={{ gap: 2 }}>
                      {stat(
                        'Walk-forward eff.',
                        ag.walkForwardEfficiency.toFixed(2),
                        ag.walkForwardEfficiency >= 0.5 ? 'up' : 'down',
                      )}
                      {stat(
                        'OOS return',
                        `${ag.oosReturnCompounded >= 0 ? '+' : ''}${(ag.oosReturnCompounded * 100).toFixed(1)}%`,
                        ag.oosReturnCompounded >= 0 ? 'up' : 'down',
                      )}
                      {stat(
                        'Profitable folds',
                        `${ag.profitableFolds}/${ag.foldCount} (${(ag.profitableFoldPct * 100).toFixed(0)}%)`,
                      )}
                      {stat('OOS trades', String(ag.totalOosTrades))}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="discovery-table" style={{ minWidth: 0, fontSize: 11 }}>
                        <thead>
                          <tr>
                            <th>#</th>
                            {keys.map((k) => (
                              <th key={k}>{k}</th>
                            ))}
                            <th>OOS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wf.folds.map((f, i) => (
                            <tr key={i}>
                              <td className="mono">{i + 1}</td>
                              {keys.map((k) => (
                                <td key={k} className="mono">
                                  {f.bestParams[k]}
                                </td>
                              ))}
                              <td
                                className={`mono ${f.oos.netProfitPct >= 0 ? 'up' : 'down'}`}
                              >
                                {(f.oos.netProfitPct * 100).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
        <button
          className={showTpo ? 'primary' : ''}
          onClick={() => setShowTpo((s) => !s)}
          style={{ fontSize: 12 }}
        >
          TPO
        </button>
        {showTpo && tpoQ.isFetching && <span className="muted small">computing…</span>}
        <button
          className={showPivots ? 'primary' : ''}
          onClick={() => setShowPivots((s) => !s)}
          style={{ fontSize: 12 }}
        >
          Pivots
        </button>
        {showPivots && (
          <>
            <select
              value={pivotMethod}
              onChange={(e) => setPivotMethod(e.target.value as PivotMethod)}
              style={{ width: 110, fontSize: 12 }}
            >
              <option value="standard">Standard</option>
              <option value="fibonacci">Fibonacci</option>
              <option value="camarilla">Camarilla</option>
              <option value="woodie">Woodie</option>
              <option value="demark">DeMark</option>
            </select>
            <select
              value={pivotPeriod}
              onChange={(e) => setPivotPeriod(e.target.value as PivotPeriod)}
              style={{ width: 56, fontSize: 12 }}
            >
              <option value="D">Daily</option>
              <option value="W">Weekly</option>
              <option value="M">Monthly</option>
            </select>
          </>
        )}
        {showPivots && pivotsQ.isFetching && <span className="muted small">computing…</span>}
        <button
          className={showIchimoku ? 'primary' : ''}
          onClick={() => setShowIchimoku((s) => !s)}
          style={{ fontSize: 12 }}
        >
          Ichimoku
        </button>
        {showIchimoku && ichimokuQ.isFetching && (
          <span className="muted small">computing…</span>
        )}
        <button
          className={showBacktest ? 'primary' : ''}
          onClick={() => setShowBacktest((s) => !s)}
          style={{ fontSize: 12 }}
        >
          Backtest
        </button>
        {showBacktest && backtestM.isPending && <span className="muted small">running…</span>}
        <span className="muted small">|</span>
        <button
          className={drawMode ? 'primary' : ''}
          onClick={() => setDrawMode((d) => !d)}
          style={{ fontSize: 12 }}
          title="Drawing tools"
        >
          ✎ Draw{drawings.length > 0 ? ` (${drawings.length})` : ''}
        </button>
        {drawMode && (
          <DrawingToolbar
            tool={drawingTool}
            onToolChange={setDrawingTool}
            style={drawingStyle}
            onStyleChange={setDrawingStyle}
            onDelete={() => setDeleteDrawingRequest((n) => n + 1)}
          />
        )}
        <span className="muted small">|</span>
        <button
          className={replayActive ? 'primary' : ''}
          onClick={() => (replayActive ? exitReplay() : enterReplay())}
          style={{ fontSize: 12 }}
          disabled={historyQ.bars.length === 0}
        >
          Replay
        </button>
        {replayActive && (
          <>
            <button
              onClick={replayStepBack}
              style={{ fontSize: 12 }}
              title="Step back"
              disabled={replayIndex <= 0}
            >
              ⏮
            </button>
            <button
              onClick={replayTogglePlay}
              style={{ fontSize: 12 }}
              title={replayPlaying ? 'Pause' : 'Play'}
            >
              {replayPlaying ? '⏸' : '▶'}
            </button>
            <button
              onClick={replayStepForward}
              style={{ fontSize: 12 }}
              title="Step forward"
              disabled={isReplayAtEnd(replayIndex, historyQ.bars.length)}
            >
              ⏭
            </button>
            <select
              value={replaySpeed}
              onChange={(e) => setReplaySpeed(Number(e.target.value))}
              style={{ width: 64 }}
              title="Replay speed"
            >
              {REPLAY_SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
            <span className="muted small mono">
              {replayIndex + 1}/{historyQ.bars.length}
            </span>
            <span className="muted small">click a bar to set start</span>
          </>
        )}
        <span className="grow" />
        {symbolInfo && (
          <span className="mono small">
            {symbolInfo.exchange}:{symbolInfo.ticker} ·{' '}
            {historyQ.bars.length} bars · {activeIndicators.length} indicators
          </span>
        )}
        {historyQ.isLoadingMore && <span className="muted small">loading more…</span>}
        <span
          className={
            streamStatus === 'live'
              ? 'up small mono'
              : streamStatus === 'down' || streamStatus === 'reconnecting'
                ? 'down small mono'
                : 'muted small mono'
          }
        >
          {streamStatus === 'live'
            ? '● live'
            : streamStatus === 'connecting'
              ? '○ connecting'
              : streamStatus === 'reconnecting'
                ? '○ reconnecting'
                : streamStatus === 'down'
                  ? '○ down'
                  : '○ idle'}
        </span>
        <Link to="/" className="muted small">
          home
        </Link>
      </div>
    </div>
  );
}
