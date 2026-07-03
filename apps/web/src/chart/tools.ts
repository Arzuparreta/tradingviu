/**
 * Drawing tool catalog: what the toolbar offers, grouped the way TradingView
 * groups them. `overlay` is the klinecharts overlay name (built-in or one of
 * ours from ./overlays).
 */

export interface DrawingToolDef {
  overlay: string;
  label: string;
  shortcut?: string;
}

export interface DrawingToolGroup {
  id: string;
  label: string;
  tools: DrawingToolDef[];
}

export const TOOL_GROUPS: DrawingToolGroup[] = [
  {
    id: 'lines',
    label: 'Lines',
    tools: [
      { overlay: 'segment', label: 'Trend line', shortcut: 'Alt+T' },
      { overlay: 'rayLine', label: 'Ray' },
      { overlay: 'straightLine', label: 'Extended line' },
      { overlay: 'horizontalStraightLine', label: 'Horizontal line', shortcut: 'Alt+H' },
      { overlay: 'horizontalRayLine', label: 'Horizontal ray' },
      { overlay: 'verticalStraightLine', label: 'Vertical line', shortcut: 'Alt+V' },
      { overlay: 'crossLine', label: 'Cross line' },
      { overlay: 'arrow', label: 'Arrow' },
      { overlay: 'priceLine', label: 'Price line' },
    ],
  },
  {
    id: 'channels',
    label: 'Channels',
    tools: [
      { overlay: 'parallelChannel', label: 'Parallel channel', shortcut: 'Alt+C' },
      { overlay: 'flatTopBottom', label: 'Flat top/bottom' },
      { overlay: 'regressionTrend', label: 'Regression trend' },
      { overlay: 'andrewsPitchfork', label: 'Pitchfork' },
    ],
  },
  {
    id: 'fib',
    label: 'Fibonacci',
    tools: [
      { overlay: 'fibRetracement', label: 'Fib retracement', shortcut: 'Alt+F' },
      { overlay: 'fibExtension', label: 'Fib extension' },
    ],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    tools: [
      { overlay: 'rect', label: 'Rectangle', shortcut: 'Alt+R' },
      { overlay: 'ellipse', label: 'Ellipse' },
      { overlay: 'triangle', label: 'Triangle' },
    ],
  },
  {
    id: 'annotations',
    label: 'Annotations',
    tools: [
      { overlay: 'text', label: 'Text' },
      { overlay: 'callout', label: 'Callout' },
      { overlay: 'priceLabel', label: 'Price label' },
    ],
  },
  {
    id: 'measure',
    label: 'Measure & position',
    tools: [
      { overlay: 'priceRange', label: 'Price range' },
      { overlay: 'dateRange', label: 'Date range' },
      { overlay: 'longPosition', label: 'Long position' },
      { overlay: 'shortPosition', label: 'Short position' },
    ],
  },
];

export const TOOL_LABELS: Record<string, string> = Object.fromEntries(
  TOOL_GROUPS.flatMap((g) => g.tools.map((t) => [t.overlay, t.label])),
);

/** Shortcut key (with Alt) → overlay name. */
export const TOOL_SHORTCUTS: Record<string, string> = Object.fromEntries(
  TOOL_GROUPS.flatMap((g) =>
    g.tools
      .filter((t) => t.shortcut)
      .map((t) => [t.shortcut!.split('+')[1]!.toLowerCase(), t.overlay]),
  ),
);
