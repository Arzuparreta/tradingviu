import {
  useEffect,
  useMemo,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActionType, type Chart, type KLineData, type Overlay } from 'klinecharts';
import type { SymbolInfo, Period } from '@klinecharts/pro';
import type { Panel } from '@tv/layout-sync';
import type { Drawing } from '@tv/drawing-tools';
import { api } from '../api/client';
import { KLineProChart, type KLineProChartHandle } from './KLineProChart';
import {
  TradingviuDatafeed,
  periodToInterval,
  intervalToPeriod,
  type TvSymbolInfo,
  type DatafeedCallbacks,
} from './klinepro-datafeed';

export interface PanelBounds {
  min: number;
  max: number;
  step: number;
}

export interface ChartPanelProps {
  panel: Panel;
  active: boolean;
  live: boolean;
  onActivate: () => void;
  onChange: (patch: Partial<Panel>) => void;
  replayActive?: boolean;
  replayCursor?: number | null;
  onBounds?: (id: string, bounds: PanelBounds | null) => void;
}

export interface KLineProChartPanelHandle {
  exportDrawings(): Drawing[];
  importDrawings(drawings: Drawing[]): void;
}

const OVERLAY_NAMES = new Set([
  'segment', 'line', 'rayLine', 'straightLine',
  'horizontalSegment', 'horizontalRayLine', 'horizontalStraightLine',
  'verticalSegment', 'verticalRayLine', 'verticalStraightLine',
  'crossLine', 'infoLine', 'trendAngle', 'arrow',
  'rect', 'circle', 'triangle', 'ellipse', 'arc',
  'rotatedRectangle', 'path', 'polyline', 'curve', 'doubleCurve',
  'text', 'callout', 'anchoredText', 'note', 'priceNote', 'priceLabel',
  'flag', 'pin', 'comment', 'signpost',
  'fibonacciLine', 'fibExtension', 'fibChannel', 'fibTimeZone',
  'fibSpeedFan', 'fibTimeExtension', 'fibCircles', 'fibSpiral',
  'fibArcs', 'fibWedge', 'pitchfan',
  'parallelStraightLine', 'priceChannelLine', 'regressionTrend',
  'flatTopBottom', 'disjointChannel',
  'priceLine', 'priceRange', 'dateRange', 'datePriceRange',
  'projection', 'forecast', 'barsPattern', 'longPosition', 'shortPosition',
  'andrewsPitchfork', 'schiffPitchfork', 'modifiedSchiffPitchfork',
  'insidePitchfork', 'gannBox', 'gannFan', 'gannSquareFixed', 'gannSquare',
  'brush', 'highlighter', 'arrowMarker',
]);

function isDrawingOverlay(ov: Overlay): boolean {
  return OVERLAY_NAMES.has(ov.name);
}

function overlayToDrawing(ov: Overlay): Drawing {
  return {
    engine: 'klinecharts' as const,
    id: ov.id,
    name: ov.name,
    groupId: ov.groupId || undefined,
    points: ov.points.map((p) => ({
      timestamp: p.timestamp,
      dataIndex: p.dataIndex,
      value: p.value,
    })),
    styles: ov.styles ?? {},
    mode: ov.mode as Drawing['mode'],
    lock: ov.lock,
    visible: ov.visible,
    zLevel: ov.zLevel,
    extendData: ov.extendData,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const KLineProChartPanel = forwardRef<KLineProChartPanelHandle, ChartPanelProps>(
  function KLineProChartPanel(
    {
      panel,
      active,
      onActivate,
      onChange,
      replayActive = false,
      replayCursor = null,
      onBounds,
    },
    ref,
  ) {
    const chartHandleRef = useRef<KLineProChartHandle>(null);
    const fullDataRef = useRef<KLineData[]>([]);
    const overlayIdsRef = useRef<Set<string>>(new Set());
    const hadCursorRef = useRef(false);
    const patchedRef = useRef(false);

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onBoundsRef = useRef(onBounds);
    onBoundsRef.current = onBounds;

    const datafeedRef = useRef<TradingviuDatafeed | null>(null);
    if (!datafeedRef.current) {
      datafeedRef.current = new TradingviuDatafeed({
        onSymbolPeriodChange: (sym: SymbolInfo, period: Period) => {
          const tvSym = sym as TvSymbolInfo;
          onChangeRef.current({
            symbolId: tvSym.id ?? null,
            interval: periodToInterval(period) as Panel['interval'],
          });
        },
      });
    }

    useEffect(() => () => {
      datafeedRef.current?.reset();
    }, []);

    const symbolsQ = useQuery({
      queryKey: ['symbols-all'],
      queryFn: () => api.allSymbols(),
      staleTime: 120_000,
    });

    const symbolInfo = useMemo<TvSymbolInfo | null>(() => {
      const rows = symbolsQ.data?.results ?? [];
      if (rows.length === 0) return null;
      const chosen = panel.symbolId
        ? rows.find((r) => r.id === panel.symbolId) ?? rows[0]
        : rows[0];
      if (!chosen) return null;
      return {
        id: chosen.id,
        ticker: chosen.ticker,
        name: chosen.name,
        exchange: chosen.exchange,
        priceCurrency: chosen.currency,
        type: chosen.assetClass,
      };
    }, [symbolsQ.data, panel.symbolId]);

    const period = useMemo(() => intervalToPeriod(panel.interval), [panel.interval]);

    const patchCoreApi = useCallback((chartApi: Chart) => {
      if (patchedRef.current) return;
      patchedRef.current = true;

      const origCreate = chartApi.createOverlay.bind(chartApi);
      chartApi.createOverlay = function (value, paneId) {
        const result = origCreate(value, paneId);
        if (typeof result === 'string') {
          overlayIdsRef.current.add(result);
        } else if (Array.isArray(result)) {
          for (const id of result) {
            if (typeof id === 'string') overlayIdsRef.current.add(id);
          }
        }
        return result;
      };

      const origRemove = chartApi.removeOverlay.bind(chartApi);
      chartApi.removeOverlay = function (remove) {
        if (typeof remove === 'string') {
          overlayIdsRef.current.delete(remove);
        } else if (remove && typeof remove === 'object' && 'id' in remove) {
          overlayIdsRef.current.delete((remove as { id: string }).id);
        }
        return origRemove(remove);
      };
    }, []);

    // Patch overlay tracking after chart is ready
    useEffect(() => {
      const id = setInterval(() => {
        const chartApi = chartHandleRef.current?.getChartApi();
        if (chartApi) {
          patchCoreApi(chartApi);
          clearInterval(id);
        }
      }, 50);
      return () => clearInterval(id);
    }, [patchCoreApi]);

    // Report bounds when data loads
    useEffect(() => {
      const chartApi = chartHandleRef.current?.getChartApi();
      if (!chartApi || !onBoundsRef.current) return;

      const handler = () => {
        const data = chartApi.getDataList();
        if (data.length === 0) {
          onBoundsRef.current?.(panel.id, null);
          return;
        }

        let step = Infinity;
        for (let i = 1; i < data.length; i++) {
          const d = (data[i]!.timestamp - data[i - 1]!.timestamp) / 1000;
          if (d > 0 && d < step) step = d;
        }

        const min = Math.floor(data[0]!.timestamp / 1000);
        const max = Math.floor(data[data.length - 1]!.timestamp / 1000);

        if (!fullDataRef.current.length) {
          fullDataRef.current = data;
        }

        onBoundsRef.current?.(panel.id, {
          min,
          max,
          step: Number.isFinite(step) && step > 0 ? step : 60,
        });
      };

      chartApi.subscribeAction(ActionType.OnDataReady, handler);

      if (chartApi.getDataList().length > 0) handler();

      return () => {
        chartApi.unsubscribeAction(ActionType.OnDataReady, handler);
      };
    }, [panel.id, symbolInfo?.id]);

    // Replay: apply filtered data
    useEffect(() => {
      const chartApi = chartHandleRef.current?.getChartApi();
      if (!chartApi) return;

      if (!replayActive) {
        if (hadCursorRef.current && fullDataRef.current.length > 0) {
          chartApi.applyNewData(fullDataRef.current, false);
          chartApi.scrollToRealTime();
          fullDataRef.current = [];
        }
        hadCursorRef.current = false;
        return;
      }

      hadCursorRef.current = true;

      if (replayCursor == null) return;

      if (fullDataRef.current.length === 0) {
        fullDataRef.current = chartApi.getDataList();
        if (fullDataRef.current.length === 0) return;
      }

      const filtered = fullDataRef.current.filter(
        (k) => k.timestamp <= replayCursor * 1000,
      );

      if (filtered.length > 0) {
        chartApi.applyNewData(filtered, false);
        chartApi.scrollToRealTime();
      }
    }, [replayActive, replayCursor]);

    // Load drawings from server
    const loadDrawings = useCallback(async () => {
      const chartApi = chartHandleRef.current?.getChartApi();
      if (!chartApi || !panel.symbolId) return;

      try {
        const res = await api.drawings(panel.symbolId, panel.interval, panel.drawingScopeId);
        for (const drawing of res.drawings) {
          try {
            const id = chartApi.createOverlay({
              id: drawing.id,
              name: drawing.name,
              groupId: drawing.groupId,
              lock: drawing.lock,
              visible: drawing.visible,
              zLevel: drawing.zLevel,
              mode: drawing.mode as string,
              styles: (drawing.styles ?? {}) as Record<string, unknown>,
              points: drawing.points as Array<Record<string, number | undefined>>,
              extendData: drawing.extendData,
            } as Parameters<Chart['createOverlay']>[0]);
            if (typeof id === 'string') overlayIdsRef.current.add(id);
          } catch {
            // skip drawings Pro doesn't support
          }
        }
      } catch {
        // drawings may not exist yet
      }
    }, [panel.symbolId, panel.interval, panel.drawingScopeId]);

    useEffect(() => {
      const id = setInterval(() => {
        if (chartHandleRef.current?.getChartApi()) {
          clearInterval(id);
          void loadDrawings();
        }
      }, 100);
      return () => clearInterval(id);
    }, [loadDrawings]);

    // Expose drawing export/import
    useImperativeHandle(ref, () => ({
      exportDrawings(): Drawing[] {
        const chartApi = chartHandleRef.current?.getChartApi();
        if (!chartApi) return [];
        const drawings: Drawing[] = [];
        for (const id of overlayIdsRef.current) {
          const ov = chartApi.getOverlayById(id);
          if (ov && isDrawingOverlay(ov)) {
            drawings.push(overlayToDrawing(ov));
          }
        }
        return drawings;
      },
      importDrawings(drawings: Drawing[]): void {
        const chartApi = chartHandleRef.current?.getChartApi();
        if (!chartApi) return;
        for (const drawing of drawings) {
          try {
            const id = chartApi.createOverlay({
              id: drawing.id,
              name: drawing.name,
              groupId: drawing.groupId,
              lock: drawing.lock,
              visible: drawing.visible,
              zLevel: drawing.zLevel,
              mode: drawing.mode as string,
              styles: (drawing.styles ?? {}) as Record<string, unknown>,
              points: drawing.points as Array<Record<string, number | undefined>>,
              extendData: drawing.extendData,
            } as Parameters<Chart['createOverlay']>[0]);
            if (typeof id === 'string') overlayIdsRef.current.add(id);
          } catch {
            // skip
          }
        }
      },
    }), []);

    if (!symbolInfo) {
      return (
        <div className={`chart-panel${active ? ' active' : ''}`}>
          <div className="chart-panel-chart" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
            {symbolsQ.isLoading ? 'Loading symbols…' : 'No symbols available'}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`chart-panel${active ? ' active' : ''}`}
        onMouseDown={onActivate}
      >
        <div className="chart-panel-chart" style={{ width: '100%', height: '100%' }}>
          <KLineProChart
            ref={chartHandleRef}
            symbol={symbolInfo}
            period={period}
            datafeed={datafeedRef.current!}
          />
        </div>
      </div>
    );
  },
);
