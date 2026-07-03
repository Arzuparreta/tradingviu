import {
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import type { Chart, KLineData, Overlay } from 'klinecharts';
import type { Panel } from '@tv/layout-sync';
import type { Drawing } from '@tv/drawing-tools';
import { api } from '../api/client';
import type { Symbol as TvSymbol } from '../api/types';
import { KLineChartSurface, type KLineChartSurfaceHandle } from './KLineChartSurface';

export interface PanelBounds {
  min: number;
  max: number;
  step: number;
}

export interface ChartPanelProps {
  panel: Panel;
  symbol: TvSymbol | null;
  active: boolean;
  live: boolean;
  onActivate: () => void;
  onChange: (patch: Partial<Panel>) => void;
  replayActive?: boolean;
  replayCursor?: number | null;
  onBounds?: (id: string, bounds: PanelBounds | null) => void;
}

export interface KLineChartPanelHandle {
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

const DRAWING_TOOLS = [
  { name: 'segment', label: 'Trend' },
  { name: 'horizontalStraightLine', label: 'H' },
  { name: 'verticalStraightLine', label: 'V' },
  { name: 'rayLine', label: 'Ray' },
  { name: 'rect', label: 'Box' },
  { name: 'circle', label: 'Circle' },
  { name: 'text', label: 'Text' },
  { name: 'priceLine', label: 'Price' },
  { name: 'fibonacciLine', label: 'Fib' },
] as const;

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

function boundsFromData(data: readonly KLineData[]): PanelBounds | null {
  if (data.length === 0) return null;

  let step = Infinity;
  for (let i = 1; i < data.length; i++) {
    const d = (data[i]!.timestamp - data[i - 1]!.timestamp) / 1000;
    if (d > 0 && d < step) step = d;
  }

  return {
    min: Math.floor(data[0]!.timestamp / 1000),
    max: Math.floor(data[data.length - 1]!.timestamp / 1000),
    step: Number.isFinite(step) && step > 0 ? step : 60,
  };
}

export const KLineChartPanel = forwardRef<KLineChartPanelHandle, ChartPanelProps>(
  function KLineChartPanel(
    {
      panel,
      symbol,
      active,
      live,
      onActivate,
      replayActive = false,
      replayCursor = null,
      onBounds,
    },
    ref,
  ) {
    const chartHandleRef = useRef<KLineChartSurfaceHandle>(null);
    const chartApiRef = useRef<Chart | null>(null);
    const fullDataRef = useRef<KLineData[]>([]);
    const overlayIdsRef = useRef<Set<string>>(new Set());
    const patchedChartIdRef = useRef<string | null>(null);
    const hadCursorRef = useRef(false);
    const loadKeyRef = useRef('');

    const onBoundsRef = useRef(onBounds);
    onBoundsRef.current = onBounds;

    const clearTrackedOverlays = useCallback(() => {
      const chartApi = chartApiRef.current;
      if (!chartApi) return;
      for (const id of overlayIdsRef.current) {
        chartApi.removeOverlay(id);
      }
      overlayIdsRef.current.clear();
    }, []);

    const patchCoreApi = useCallback((chartApi: Chart) => {
      if (patchedChartIdRef.current === chartApi.id) return;
      patchedChartIdRef.current = chartApi.id;

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

    const handleChartReady = useCallback((chart: Chart) => {
      chartApiRef.current = chart;
      patchCoreApi(chart);
    }, [patchCoreApi]);

    const handleDataReady = useCallback((data: KLineData[]) => {
      fullDataRef.current = data;
      onBoundsRef.current?.(panel.id, boundsFromData(data));
    }, [panel.id]);

    useEffect(() => {
      const key = `${panel.symbolId ?? ''}|${panel.interval}|${panel.drawingScopeId}`;
      if (loadKeyRef.current === key) return;
      loadKeyRef.current = key;
      fullDataRef.current = [];
      hadCursorRef.current = false;
      clearTrackedOverlays();
      onBoundsRef.current?.(panel.id, null);
    }, [clearTrackedOverlays, panel.drawingScopeId, panel.id, panel.interval, panel.symbolId]);

    const loadDrawings = useCallback(async () => {
      const chartApi = chartApiRef.current;
      if (!chartApi || !panel.symbolId) return;

      clearTrackedOverlays();
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
            // Skip drawings unsupported by the current KLineCharts overlay registry.
          }
        }
      } catch {
        // Drawings may not exist for a new symbol/scope yet.
      }
    }, [clearTrackedOverlays, panel.symbolId, panel.interval, panel.drawingScopeId]);

    useEffect(() => {
      if (fullDataRef.current.length === 0) return;
      void loadDrawings();
    }, [loadDrawings, panel.symbolId, panel.interval, panel.drawingScopeId]);

    useEffect(() => {
      const chartApi = chartApiRef.current;
      if (!chartApi) return;

      if (!replayActive) {
        if (hadCursorRef.current && fullDataRef.current.length > 0) {
          chartApi.applyNewData(fullDataRef.current, false);
          chartApi.scrollToRealTime();
        }
        hadCursorRef.current = false;
        return;
      }

      hadCursorRef.current = true;
      if (replayCursor == null || fullDataRef.current.length === 0) return;

      const filtered = fullDataRef.current.filter(
        (k) => k.timestamp <= replayCursor * 1000,
      );

      if (filtered.length > 0) {
        chartApi.applyNewData(filtered, false);
        chartApi.scrollToRealTime();
      }
    }, [replayActive, replayCursor]);

    const createDrawing = useCallback((name: string) => {
      chartApiRef.current?.createOverlay(name);
    }, []);

    useImperativeHandle(ref, () => ({
      exportDrawings(): Drawing[] {
        const chartApi = chartApiRef.current;
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
        const chartApi = chartApiRef.current;
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
            // Skip drawings unsupported by the current KLineCharts overlay registry.
          }
        }
      },
    }), []);

    if (!symbol) {
      return (
        <div
          className={`chart-panel${active ? ' active' : ''}`}
          onMouseDown={onActivate}
        >
          <div className="chart-panel-empty">No symbol</div>
        </div>
      );
    }

    return (
      <div
        className={`chart-panel${active ? ' active' : ''}`}
        onMouseDown={onActivate}
      >
        <div className="chart-panel-tools" onMouseDown={(event) => event.stopPropagation()}>
          {DRAWING_TOOLS.map((tool) => (
            <button
              key={tool.name}
              type="button"
              className="chart-tool-btn"
              onClick={() => createDrawing(tool.name)}
              title={tool.name}
            >
              {tool.label}
            </button>
          ))}
        </div>
        <div className="chart-panel-chart">
          <KLineChartSurface
            ref={chartHandleRef}
            symbol={symbol}
            interval={panel.interval}
            live={live}
            onChartReady={handleChartReady}
            onDataReady={handleDataReady}
          />
        </div>
      </div>
    );
  },
);
