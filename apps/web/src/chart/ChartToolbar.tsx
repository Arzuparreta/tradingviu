import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { TOOL_GROUPS } from './tools';
import {
  IconArrowTool,
  IconCallout,
  IconChevronRight,
  IconCrossLine,
  IconCursor,
  IconDateRange,
  IconEllipse,
  IconExtendedLine,
  IconEye,
  IconEyeOff,
  IconFibExtension,
  IconFibRetracement,
  IconFlatTopBottom,
  IconHorizontalLine,
  IconHorizontalRay,
  IconLock,
  IconLongPosition,
  IconMagnet,
  IconParallelChannel,
  IconPin,
  IconPitchfork,
  IconPriceLabel,
  IconPriceLine,
  IconPriceRange,
  IconRay,
  IconRect,
  IconRedo,
  IconRegression,
  IconShortPosition,
  IconText,
  IconTrash,
  IconTrendLine,
  IconTriangle,
  IconUndo,
  IconUnlock,
  IconVerticalLine,
  type IconProps,
} from '../ui/icons';

export const TOOL_ICONS: Record<string, ComponentType<IconProps>> = {
  segment: IconTrendLine,
  rayLine: IconRay,
  straightLine: IconExtendedLine,
  horizontalStraightLine: IconHorizontalLine,
  horizontalRayLine: IconHorizontalRay,
  verticalStraightLine: IconVerticalLine,
  crossLine: IconCrossLine,
  arrow: IconArrowTool,
  priceLine: IconPriceLine,
  parallelChannel: IconParallelChannel,
  flatTopBottom: IconFlatTopBottom,
  regressionTrend: IconRegression,
  andrewsPitchfork: IconPitchfork,
  fibRetracement: IconFibRetracement,
  fibExtension: IconFibExtension,
  rect: IconRect,
  ellipse: IconEllipse,
  triangle: IconTriangle,
  text: IconText,
  callout: IconCallout,
  priceLabel: IconPriceLabel,
  priceRange: IconPriceRange,
  dateRange: IconDateRange,
  longPosition: IconLongPosition,
  shortPosition: IconShortPosition,
};

export type MagnetMode = 'off' | 'weak' | 'strong';

export interface DrawingWorkspaceState {
  canUndo: boolean;
  canRedo: boolean;
  allHidden: boolean;
  allLocked: boolean;
  count: number;
}

export interface ChartToolbarProps {
  activeTool: string | null;
  onSelectTool: (overlay: string | null) => void;
  magnet: MagnetMode;
  onMagnetChange: (mode: MagnetMode) => void;
  stayInDrawingMode: boolean;
  onToggleStay: () => void;
  drawingState: DrawingWorkspaceState;
  onUndo: () => void;
  onRedo: () => void;
  onToggleHideAll: () => void;
  onToggleLockAll: () => void;
  onDeleteAll: () => void;
}

const LAST_USED_KEY = 'tv_toolbar_last_used';

const loadLastUsed = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(LAST_USED_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
};

export function ChartToolbar({
  activeTool,
  onSelectTool,
  magnet,
  onMagnetChange,
  stayInDrawingMode,
  onToggleStay,
  drawingState,
  onUndo,
  onRedo,
  onToggleHideAll,
  onToggleLockAll,
  onDeleteAll,
}: ChartToolbarProps) {
  const [lastUsed, setLastUsed] = useState<Record<string, string>>(loadLastUsed);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // Flyouts render position:fixed so the toolbar's scroll container can't clip them.
  const [flyoutTop, setFlyoutTop] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenGroup(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openGroup]);

  const pick = useCallback(
    (groupId: string, overlay: string) => {
      setLastUsed((prev) => {
        const next = { ...prev, [groupId]: overlay };
        try {
          localStorage.setItem(LAST_USED_KEY, JSON.stringify(next));
        } catch {
          void 0;
        }
        return next;
      });
      setOpenGroup(null);
      onSelectTool(overlay);
    },
    [onSelectTool],
  );

  const magnetNext: Record<MagnetMode, MagnetMode> = { off: 'weak', weak: 'strong', strong: 'off' };
  const magnetTitle =
    magnet === 'off' ? 'Magnet: off' : magnet === 'weak' ? 'Magnet: weak (snaps near OHLC)' : 'Magnet: strong (always snaps OHLC)';

  return (
    <div className="chart-toolbar" ref={rootRef}>
      <button
        type="button"
        className={`chart-tool-btn${activeTool === null ? ' active' : ''}`}
        onClick={() => onSelectTool(null)}
        title="Cursor (Esc)"
        aria-label="Cursor"
      >
        <IconCursor size={18} />
      </button>

      <span className="chart-tool-divider" />

      {TOOL_GROUPS.map((group) => {
        const current = group.tools.find((t) => t.overlay === lastUsed[group.id]) ?? group.tools[0]!;
        const CurrentIcon = TOOL_ICONS[current.overlay] ?? IconTrendLine;
        const groupActive = group.tools.some((t) => t.overlay === activeTool);
        return (
          <div key={group.id} className="chart-tool-group">
            <button
              type="button"
              className={`chart-tool-btn${groupActive ? ' active' : ''}`}
              onClick={() => pick(group.id, current.overlay)}
              title={`${current.label}${current.shortcut ? ` (${current.shortcut})` : ''}`}
              aria-label={current.label}
            >
              <CurrentIcon size={18} />
            </button>
            <button
              type="button"
              className={`chart-tool-flyout-arrow${openGroup === group.id ? ' open' : ''}`}
              onClick={(e) => {
                const rect = e.currentTarget.closest('.chart-tool-group')?.getBoundingClientRect();
                setFlyoutTop(rect ? rect.top - 4 : 100);
                setOpenGroup((g) => (g === group.id ? null : group.id));
              }}
              aria-label={`${group.label} tools`}
            >
              <IconChevronRight size={9} />
            </button>
            {openGroup === group.id && (
              <div className="chart-tool-flyout" style={{ top: flyoutTop }} role="menu">
                <div className="chart-tool-flyout-title">{group.label}</div>
                {group.tools.map((tool) => {
                  const Icon = TOOL_ICONS[tool.overlay] ?? IconTrendLine;
                  return (
                    <button
                      key={tool.overlay}
                      type="button"
                      role="menuitem"
                      className={`chart-tool-flyout-item${tool.overlay === activeTool ? ' active' : ''}`}
                      onClick={() => pick(group.id, tool.overlay)}
                    >
                      <Icon size={16} />
                      <span>{tool.label}</span>
                      {tool.shortcut && <kbd>{tool.shortcut}</kbd>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <span className="chart-tool-divider" />

      <button
        type="button"
        className={`chart-tool-btn${magnet !== 'off' ? ' active' : ''}${magnet === 'strong' ? ' strong' : ''}`}
        onClick={() => onMagnetChange(magnetNext[magnet])}
        title={magnetTitle}
        aria-label={magnetTitle}
      >
        <IconMagnet size={18} />
      </button>
      <button
        type="button"
        className={`chart-tool-btn${stayInDrawingMode ? ' active' : ''}`}
        onClick={onToggleStay}
        title="Stay in drawing mode"
        aria-label="Stay in drawing mode"
      >
        <IconPin size={18} />
      </button>

      <span className="grow" />

      <button
        type="button"
        className="chart-tool-btn"
        onClick={onUndo}
        disabled={!drawingState.canUndo}
        title="Undo (⌘Z)"
        aria-label="Undo"
      >
        <IconUndo size={17} />
      </button>
      <button
        type="button"
        className="chart-tool-btn"
        onClick={onRedo}
        disabled={!drawingState.canRedo}
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
      >
        <IconRedo size={17} />
      </button>

      <span className="chart-tool-divider" />

      <button
        type="button"
        className={`chart-tool-btn${drawingState.allHidden ? ' active' : ''}`}
        onClick={onToggleHideAll}
        disabled={drawingState.count === 0}
        title={drawingState.allHidden ? 'Show all drawings' : 'Hide all drawings'}
        aria-label={drawingState.allHidden ? 'Show all drawings' : 'Hide all drawings'}
      >
        {drawingState.allHidden ? <IconEyeOff size={17} /> : <IconEye size={17} />}
      </button>
      <button
        type="button"
        className={`chart-tool-btn${drawingState.allLocked ? ' active' : ''}`}
        onClick={onToggleLockAll}
        disabled={drawingState.count === 0}
        title={drawingState.allLocked ? 'Unlock all drawings' : 'Lock all drawings'}
        aria-label={drawingState.allLocked ? 'Unlock all drawings' : 'Lock all drawings'}
      >
        {drawingState.allLocked ? <IconLock size={17} /> : <IconUnlock size={17} />}
      </button>
      <button
        type="button"
        className="chart-tool-btn danger"
        onClick={onDeleteAll}
        disabled={drawingState.count === 0}
        title="Remove all drawings"
        aria-label="Remove all drawings"
      >
        <IconTrash size={17} />
      </button>
    </div>
  );
}
