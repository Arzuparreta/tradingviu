import { useEffect, useMemo, useRef, useState } from 'react';
import { INTERVALS, type Interval, type Panel } from '@tv/layout-sync';
import { SymbolSearch } from './SymbolSearch';
import { KLineChartSurface } from './KLineChartSurface';
import { useChartHistory } from '../hooks/use-chart-history';
import { useBarStream } from '../hooks/use-bar-stream';
import { useDrawings } from '../hooks/use-drawings';

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
  const onBoundsRef = useRef(onBounds);
  onBoundsRef.current = onBounds;

  const historyQ = useChartHistory({
    symbolId: panel.symbolId ?? null,
    interval: panel.interval,
    pageSize: 500,
  });
  const drawingsState = useDrawings({
    symbolId: panel.symbolId ?? null,
    interval: panel.interval,
    scopeId: panel.drawingScopeId,
    enabled: true,
  });

  const renderBars = useMemo(() => {
    if (replayActive && replayCursor != null) return historyQ.bars.filter((b) => b.time <= replayCursor);
    return historyQ.bars;
  }, [historyQ.bars, replayActive, replayCursor]);

  const historyQRef = useRef(historyQ);
  historyQRef.current = historyQ;
  useBarStream({
    symbolId: live && !replayActive && panel.symbolId && historyQ.symbol ? panel.symbolId : null,
    exchange: historyQ.symbol?.exchange ?? '',
    ticker: historyQ.symbol?.ticker ?? '',
    interval: panel.interval,
    onBar: (bar) => historyQRef.current.upsertBar(bar),
  });

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
        <KLineChartSurface
          bars={renderBars}
          drawings={drawingsState.drawings}
          active={active}
          live={live}
          loading={!!panel.symbolId && historyQ.isLoading}
          onDrawingsChange={drawingsState.setDrawings}
          onLoadMore={historyQ.loadMore}
          onBounds={(bounds) => onBoundsRef.current?.(panel.id, bounds)}
          replayCursor={replayActive ? replayCursor : null}
        />
      </div>
    </div>
  );
}
