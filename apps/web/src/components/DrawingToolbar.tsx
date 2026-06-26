import type { DrawingStyle, DrawingTool } from '@tv/drawing-tools';

interface DrawingToolbarProps {
  tool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  style: DrawingStyle;
  onStyleChange: (style: DrawingStyle) => void;
  onDelete: () => void;
}

const TOOLS: readonly (readonly [DrawingTool, string])[] = [
  ['cursor', 'Cursor'],
  ['select', 'Select'],
  ['trend-line', 'Line'],
  ['ray', 'Ray'],
  ['extended-line', 'Extend'],
  ['horizontal-line', 'H'],
  ['vertical-line', 'V'],
  ['rectangle', 'Rect'],
  ['text', 'Text'],
];

/** Tool picker + style controls shared by the layout grid and the main chart. */
export function DrawingToolbar({ tool, onToolChange, style, onStyleChange, onDelete }: DrawingToolbarProps) {
  return (
    <div className="drawing-toolbar">
      {TOOLS.map(([value, label]) => (
        <button
          key={value}
          className={tool === value ? 'primary' : 'ghost'}
          onClick={() => onToolChange(value)}
          title={label}
          style={{ padding: '4px 8px' }}
        >
          {label}
        </button>
      ))}
      <input
        type="color"
        value={style.color}
        onChange={(e) => onStyleChange({ ...style, color: e.target.value })}
        title="Drawing color"
      />
      <select
        value={style.lineStyle}
        onChange={(e) => onStyleChange({ ...style, lineStyle: e.target.value as DrawingStyle['lineStyle'] })}
        title="Line style"
      >
        <option value="solid">solid</option>
        <option value="dashed">dash</option>
        <option value="dotted">dot</option>
      </select>
      <select
        value={style.width}
        onChange={(e) => onStyleChange({ ...style, width: Number(e.target.value) })}
        title="Line width"
      >
        {[1, 2, 3, 4, 5, 6].map((w) => (
          <option key={w} value={w}>
            {w}px
          </option>
        ))}
      </select>
      <button className="ghost" onClick={onDelete} title="Delete selected drawing">
        Delete
      </button>
    </div>
  );
}
