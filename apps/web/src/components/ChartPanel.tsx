import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { INTERVALS, type Interval, type Panel } from '@tv/layout-sync';
import { SymbolSearch } from './SymbolSearch';
import { ChartSurface } from './chart-surface';
import type { ChartSurfaceHandle } from './chart-surface';
import { DrawingToolbar } from './DrawingToolbar';
import { useChartHistory } from '../hooks/use-chart-history';
import { useBarStream } from '../hooks/use-bar-stream';
import { useDrawingManager } from '../hooks/use-drawing-manager';

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

export function ChartPanel({
  panel,
  active,
  live,
  onActivate,
  onChange,
  replayActive = false,
  replayCursor = null,
  onBounds,
}: ChartPanelProps) {
  const [picking, setPicking] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const surfaceRef = useRef<ChartSurfaceHandle>(null);
  const onBoundsRef = useRef(onBounds);
  onBoundsRef.current = onBounds;

  const historyQ = useChartHistory({
    symbolId: panel.symbolId ?? null,
    interval: panel.interval,
    pageSize: 500,
  });

  const drawingMgr = useDrawingManager({
    surfaceRef,
    symbolId: panel.symbolId ?? null,
    interval: panel.interval,
    scopeId: panel.drawingScopeId,
    chartReady,
    enabled: true,
  });

  // Clip bars for replay
  const renderBars = useMemo(() => {
    if (replayActive && replayCursor != null) return historyQ.bars.filter((b) => b.time <= replayCursor);
    return historyQ.bars;
  }, [historyQ.bars, replayActive, replayCursor]);

  // Live bar stream
  const historyQRef = useRef(historyQ);
  historyQRef.current = historyQ;
  useBarStream({
    symbolId: live && !replayActive && panel.symbolId && historyQ.symbol ? panel.symbolId : null,
    exchange: historyQ.symbol?.exchange ?? '',
    ticker: historyQ.symbol?.ticker ?? '',
    interval: panel.interval,
    onBar: (bar) => {
      historyQRef.current.upsertBar(bar);
      // Push live bar directly to the chart surface
      surfaceRef.current?.updateBar({
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
    },
  });

  // Report bounds for crosshair sync
  useEffect(() => {
    if (historyQ.bars.length === 0) {
      onBoundsRef.current?.(panel.id, null);
      return;
    }
    let step = Infinity;
    for (let i = 1; i < historyQ.bars.length; i++) {
      const d = historyQ.bars[i]!.time - historyQ.bars[i - 1]!.time;
      if (d > 0 && d < step) step = d;
    }
    onBoundsRef.current?.(panel.id, {
      min: historyQ.bars[0]!.time,
      max: historyQ.bars[historyQ.bars.length - 1]!.time,
      step: Number.isFinite(step) ? step : 60,
    });
  }, [historyQ.bars, panel.id]);

  // Handle visible range change: trigger loadMore when scrolled near left edge
  const intervalSec = useMemo(() => {
    const map: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };
    return map[panel.interval] ?? 3600;
  }, [panel.interval]);
  const triggerZone = 5 * intervalSec;

  const handleVisibleRangeChange = useCallback(
    (range: { from: number; to: number } | null) => {
      if (!range || replayActive) return;
      const hq = historyQRef.current;
      const earliest = hq.bars[0]?.time;
      if (earliest === undefined) return;
      if (range.from - earliest < triggerZone && hq.hasMore && !hq.isLoadingMore) {
        void hq.loadMore();
      }
    },
    [replayActive, triggerZone],
  );

  // Push bars to chart surface when data changes
  const prevBarCountRef = useRef(0);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || renderBars.length === 0) return;
    surface.setData(
      renderBars.map((b) => ({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      })),
    );
    prevBarCountRef.current = renderBars.length;
  }, [renderBars]);

  const sym = historyQ.symbol;
  const showPicker = picking || !panel.symbolId;

  return (
    <div className={`chart-panel${active ? ' active' : ''}`} onMouseDown={onActivate}>
      <div className="chart-panel-head">
        {showPicker ? (
          <div onMouseDown={(e) => e.stopPropagation()} style={{ flex: 1 }}>
            <SymbolSearch
              autoFocus
              placeholder="Pick symbol..."
              onSelect={(s) => {
                onChange({ symbolId: s.id });
                setPicking(false);
              }}
            />
          </div>
        ) : (
          <button className="ghost chart-panel-sym" onMouseDown={(e) => { e.stopPropagation(); onActivate(); setPicking(true); }}>
            <span className="mono">{sym ? `${sym.exchange}:${sym.ticker}` : panel.symbolId}</span>
          </button>
        )}
        <select
          value={panel.interval}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ interval: e.target.value as Interval })}
          style={{ width: 64 }}
        >
          {INTERVALS.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </div>
      <div className="chart-panel-chart">
        <ChartSurface
          ref={surfaceRef}
          onReady={() => setChartReady(true)}
          onVisibleRangeChange={handleVisibleRangeChange}
        >
          {chartReady && drawingMgr.ready && (
            <DrawingToolbar
              manager={drawingMgr.manager}
              drawings={drawingMgr.drawings}
              activeTool={drawingMgr.activeTool}
              selectedId={drawingMgr.selectedId}
              isPlacing={drawingMgr.isPlacing}
              canUndo={drawingMgr.canUndo}
              canRedo={drawingMgr.canRedo}
              onStartTool={drawingMgr.startTool}
              onCancelPlacement={drawingMgr.cancelPlacement}
              onSelectDrawing={drawingMgr.selectDrawing}
              onRemoveSelected={drawingMgr.removeSelected}
              onClearAll={drawingMgr.clearAll}
              onToggleLock={drawingMgr.toggleLock}
              onToggleVisibility={drawingMgr.toggleVisibility}
              onRenameDrawing={drawingMgr.renameDrawing}
              onUpdateStyle={drawingMgr.updateStyle}
              onDuplicateDrawing={drawingMgr.duplicateDrawing}
              onCopyDrawing={drawingMgr.copyDrawing}
              onPasteDrawing={drawingMgr.pasteDrawing}
              onMoveDrawing={drawingMgr.moveDrawing}
              onSetDrawingGroup={drawingMgr.setDrawingGroup}
              onUndo={drawingMgr.undo}
              onRedo={drawingMgr.redo}
            />
          )}
        </ChartSurface>
      </div>
    </div>
  );
}
