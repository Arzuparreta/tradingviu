import { IconCopy, IconEye, IconEyeOff, IconLock, IconText, IconTrash, IconUnlock } from '../ui/icons';

/**
 * Floating editor for the selected drawing: color, width, line style, and the
 * lifecycle actions. Semantic tools (measure/positions/fib) hide the palette —
 * their colors mean something.
 */

export const DRAWING_PALETTE = [
  '#2e6cff',
  '#2dbd96',
  '#f0616d',
  '#f5b53d',
  '#c77ff0',
  '#4cc9b8',
  '#848b97',
  '#f3f5f9',
] as const;

export type LineStyleKind = 'solid' | 'dashed' | 'dotted';

export interface DrawingStyleValue {
  color: string;
  size: number;
  lineStyle: LineStyleKind;
  locked: boolean;
  visible: boolean;
  showPalette: boolean;
  hasText: boolean;
}

export interface DrawingStyleBarProps {
  value: DrawingStyleValue;
  position: { x: number; y: number };
  onColor: (color: string) => void;
  onSize: (size: number) => void;
  onLineStyle: (style: LineStyleKind) => void;
  onEditText: () => void;
  onClone: () => void;
  onToggleLock: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
}

const LINE_STYLES: { kind: LineStyleKind; title: string; dash?: string }[] = [
  { kind: 'solid', title: 'Solid' },
  { kind: 'dashed', title: 'Dashed', dash: '5 4' },
  { kind: 'dotted', title: 'Dotted', dash: '1.5 3.5' },
];

export function DrawingStyleBar({
  value,
  position,
  onColor,
  onSize,
  onLineStyle,
  onEditText,
  onClone,
  onToggleLock,
  onToggleVisible,
  onDelete,
}: DrawingStyleBarProps) {
  return (
    <div
      className="drawing-style-bar"
      style={{ left: position.x, top: position.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {value.showPalette && (
        <>
          <div className="dsb-swatches">
            {DRAWING_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`dsb-swatch${c === value.color ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => onColor(c)}
                title={c}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <span className="dsb-divider" />
          <div className="dsb-widths">
            {[1, 2, 3].map((w) => (
              <button
                key={w}
                type="button"
                className={`dsb-btn${w === value.size ? ' active' : ''}`}
                onClick={() => onSize(w)}
                title={`Width ${w}`}
                aria-label={`Line width ${w}`}
              >
                <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
                  <line x1={2} y1={8} x2={14} y2={8} stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
                </svg>
              </button>
            ))}
          </div>
          <div className="dsb-widths">
            {LINE_STYLES.map((s) => (
              <button
                key={s.kind}
                type="button"
                className={`dsb-btn${s.kind === value.lineStyle ? ' active' : ''}`}
                onClick={() => onLineStyle(s.kind)}
                title={s.title}
                aria-label={`${s.title} line`}
              >
                <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
                  <line x1={2} y1={8} x2={14} y2={8} stroke="currentColor" strokeWidth={1.4} strokeDasharray={s.dash} strokeLinecap="round" />
                </svg>
              </button>
            ))}
          </div>
          <span className="dsb-divider" />
        </>
      )}
      {value.hasText && (
        <button type="button" className="dsb-btn" onClick={onEditText} title="Edit text" aria-label="Edit text">
          <IconText size={15} />
        </button>
      )}
      <button type="button" className="dsb-btn" onClick={onClone} title="Clone" aria-label="Clone drawing">
        <IconCopy size={15} />
      </button>
      <button
        type="button"
        className={`dsb-btn${value.locked ? ' active' : ''}`}
        onClick={onToggleLock}
        title={value.locked ? 'Unlock' : 'Lock'}
        aria-label={value.locked ? 'Unlock drawing' : 'Lock drawing'}
      >
        {value.locked ? <IconLock size={15} /> : <IconUnlock size={15} />}
      </button>
      <button
        type="button"
        className="dsb-btn"
        onClick={onToggleVisible}
        title={value.visible ? 'Hide' : 'Show'}
        aria-label={value.visible ? 'Hide drawing' : 'Show drawing'}
      >
        {value.visible ? <IconEye size={15} /> : <IconEyeOff size={15} />}
      </button>
      <button type="button" className="dsb-btn danger" onClick={onDelete} title="Delete (Del)" aria-label="Delete drawing">
        <IconTrash size={15} />
      </button>
    </div>
  );
}
