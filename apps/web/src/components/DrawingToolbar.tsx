import { useEffect } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BadgeCent,
  BadgeDollarSign,
  CalendarDays,
  ChartSpline,
  ChartNoAxesCombined,
  Circle,
  Flag,
  GitBranch,
  Highlighter,
  Lock,
  LockOpen,
  MapPin,
  MessageSquare,
  Milestone,
  MousePointer2,
  MoveHorizontal,
  MoveVertical,
  NotebookText,
  PanelTop,
  PenLine,
  Redo2,
  Rows3,
  Ruler,
  Slash,
  Spline,
  Square,
  SquareArrowUpRight,
  Table2,
  Trash2,
  TrendingUp,
  Triangle,
  Type,
  Undo2,
  Waypoints,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DrawingTool } from '@tv/drawing-tools';
import { KLINE_TOOL_GROUPS } from '@tv/drawing-tools';
import type { DrawingManager } from '@tv/drawing-tools';
import type { Drawing } from '@tv/drawing-tools';

// ── Icon map ────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, LucideIcon> = {
  cursor: MousePointer2,
  segment: Slash,
  line: TrendingUp,
  rayLine: TrendingUp,
  straightLine: SquareArrowUpRight,
  horizontalRayLine: MoveHorizontal,
  horizontalStraightLine: MoveHorizontal,
  verticalStraightLine: MoveVertical,
  crossLine: Spline,
  infoLine: Ruler,
  trendAngle: ChartSpline,
  arrow: ArrowUp,
  rect: Square,
  circle: Circle,
  triangle: Triangle,
  ellipse: Circle,
  arc: ChartSpline,
  rotatedRectangle: SquareArrowUpRight,
  path: PenLine,
  polyline: Waypoints,
  curve: Spline,
  doubleCurve: Spline,
  text: Type,
  callout: MessageSquare,
  anchoredText: Type,
  note: NotebookText,
  priceNote: BadgeCent,
  priceLabel: BadgeCent,
  flag: Flag,
  pin: MapPin,
  comment: MessageSquare,
  signpost: Milestone,
  table: Table2,
  fibonacciLine: ChartSpline,
  fibExtension: ChartSpline,
  fibChannel: ChartSpline,
  fibTimeZone: CalendarDays,
  fibSpeedFan: ChartSpline,
  fibTimeExtension: CalendarDays,
  fibCircles: Circle,
  fibSpiral: Spline,
  fibArcs: ChartSpline,
  fibWedge: ChartSpline,
  pitchfan: ChartSpline,
  parallelStraightLine: PanelTop,
  priceChannelLine: GitBranch,
  regressionTrend: ChartNoAxesCombined,
  flatTopBottom: PanelTop,
  disjointChannel: GitBranch,
  priceLine: BadgeCent,
  priceRange: Ruler,
  dateRange: CalendarDays,
  datePriceRange: Ruler,
  projection: Milestone,
  forecast: ChartNoAxesCombined,
  barsPattern: Rows3,
  longPosition: BadgeDollarSign,
  shortPosition: BadgeDollarSign,
  andrewsPitchfork: GitBranch,
  schiffPitchfork: GitBranch,
  modifiedSchiffPitchfork: GitBranch,
  insidePitchfork: GitBranch,
  gannBox: Square,
  gannFan: ChartSpline,
  gannSquareFixed: Square,
  gannSquare: Square,
  brush: PenLine,
  highlighter: Highlighter,
  arrowMarker: ArrowUp,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
};

const TOOL_SHORTCUTS: Partial<Record<DrawingTool, string>> = {
  cursor: 'Esc',
  segment: 'T',
  rayLine: 'R',
  straightLine: 'E',
  horizontalStraightLine: 'H',
  verticalStraightLine: 'V',
  rect: 'B',
  text: 'N',
  fibonacciLine: 'F',
  priceChannelLine: 'C',
  priceLine: 'P',
};

const HOTKEY_MAP: Record<string, DrawingTool> = {
  t: 'segment',
  r: 'rayLine',
  e: 'straightLine',
  h: 'horizontalStraightLine',
  v: 'verticalStraightLine',
  b: 'rect',
  n: 'text',
  f: 'fibonacciLine',
  p: 'priceLine',
  c: 'priceChannelLine',
};

// ── Props ───────────────────────────────────────────────────────────────

export interface DrawingToolbarProps {
  manager: DrawingManager | null;
  drawings: readonly Drawing[];
  activeTool: string | null;
  selectedId: string | null;
  isPlacing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onStartTool: (toolName: string) => void;
  onCancelPlacement: () => void;
  onSelectDrawing: (id: string | null) => void;
  onRemoveSelected: () => void;
  onClearAll: () => void;
  onToggleLock: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}

// ── Component ───────────────────────────────────────────────────────────

export function DrawingToolbar({
  manager,
  drawings,
  activeTool,
  selectedId,
  isPlacing,
  canUndo,
  canRedo,
  onStartTool,
  onCancelPlacement,
  onSelectDrawing,
  onRemoveSelected,
  onClearAll,
  onToggleLock,
  onUndo,
  onRedo,
}: DrawingToolbarProps) {
  const selected = drawings.find((d) => d.id === selectedId) ?? null;
  const selectedLocked = selected?.lock ?? false;

  // Keyboard shortcuts
  useEffect(() => {
    const isEditable = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditable(e.target)) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod && key === 'y') { e.preventDefault(); onRedo(); return; }

      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') { e.preventDefault(); onCancelPlacement(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onRemoveSelected(); return; }

      const nextTool = HOTKEY_MAP[key];
      if (nextTool) { e.preventDefault(); onStartTool(nextTool); }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUndo, onRedo, onCancelPlacement, onRemoveSelected, onStartTool]);

  return (
    <div
      className="lwc-drawing-toolbar"
      style={{ pointerEvents: 'auto' }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      {/* Undo / Redo */}
      <div className="lwc-drawing-toolbar-group">
        <button
          className="ghost icon" type="button"
          onClick={onUndo} disabled={!canUndo}
          title="Undo (Ctrl+Z)" aria-label="Undo"
        >
          <Undo2 size={15} />
        </button>
        <button
          className="ghost icon" type="button"
          onClick={onRedo} disabled={!canRedo}
          title="Redo (Ctrl+Y)" aria-label="Redo"
        >
          <Redo2 size={15} />
        </button>
      </div>

      {/* Tool buttons */}
      {KLINE_TOOL_GROUPS.map((group) => (
        <div className="lwc-drawing-toolbar-group" key={group.id} aria-label={group.label}>
          {group.tools.map(([value, label]) => {
            const Icon = TOOL_ICONS[value] ?? MousePointer2;
            const isActive = value === 'cursor' ? !activeTool : activeTool === value;
            return (
              <button
                key={value}
                className={isActive ? 'primary icon' : 'ghost icon'}
                type="button"
                onClick={() => {
                  if (value === 'cursor') {
                    onCancelPlacement();
                  } else {
                    onStartTool(value);
                  }
                }}
                title={`${label}${TOOL_SHORTCUTS[value] ? ` (${TOOL_SHORTCUTS[value]})` : ''}`}
                aria-label={label}
              >
                <Icon size={15} />
              </button>
            );
          })}
        </div>
      ))}

      {/* Actions */}
      <div className="lwc-drawing-toolbar-group">
        <button
          className="ghost icon" type="button"
          onClick={() => selectedId && onToggleLock(selectedId)}
          disabled={!selectedId}
          title="Lock (L)" aria-label="Lock"
        >
          {selectedLocked ? <Lock size={15} /> : <LockOpen size={15} />}
        </button>
        <button
          className="ghost icon" type="button"
          onClick={onRemoveSelected}
          disabled={!selectedId}
          title="Delete (Del)" aria-label="Delete"
        >
          <Trash2 size={15} />
        </button>
        <button
          className="ghost" type="button"
          onClick={onClearAll}
          disabled={drawings.length === 0}
          title="Clear all"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
