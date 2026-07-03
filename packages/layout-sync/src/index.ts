import { z } from 'zod';

/** Chart intervals supported by the platform (mirrors apps/web ChartPage + chart route). */
export const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;
export const IntervalSchema = z.enum(INTERVALS);
export type Interval = z.infer<typeof IntervalSchema>;

/** Grid presets: how many chart panels and how they tile (CSS grid columns/rows). */
export const GRID_PRESETS = {
  '1': { count: 1, cols: 1, rows: 1, label: '1 chart' },
  '2': { count: 2, cols: 2, rows: 1, label: '2 charts' },
  '4': { count: 4, cols: 2, rows: 2, label: '4 charts' },
  '8': { count: 8, cols: 4, rows: 2, label: '8 charts' },
  '16': { count: 16, cols: 4, rows: 4, label: '16 charts' },
} as const;

export type GridKey = keyof typeof GRID_PRESETS;
export const GRID_KEYS = Object.keys(GRID_PRESETS) as GridKey[];

export const GridSchema = z.enum(GRID_KEYS as [GridKey, ...GridKey[]]);

export const panelCountFor = (grid: GridKey): number => GRID_PRESETS[grid].count;

/** Candle rendering styles supported by the chart engine (klinecharts CandleType). */
export const CHART_TYPES = ['candle_solid', 'candle_stroke', 'ohlc', 'area'] as const;
export const ChartTypeSchema = z.enum(CHART_TYPES);
export type ChartType = z.infer<typeof ChartTypeSchema>;

let panelSeq = 0;
const newPanelId = (): string => `p${Date.now().toString(36)}${(panelSeq++).toString(36)}`;
const newDrawingScopeId = (): string => `draw_${Date.now().toString(36)}${(panelSeq++).toString(36)}`;

/** A single chart panel within a layout. */
export const PanelSchema = z.object({
  /** Stable panel id (so React keys + sync targeting survive re-tiling). */
  id: z.string().min(1).max(40),
  /** Stable drawing storage scope for this chart instance. */
  drawingScopeId: z.string().min(1).max(80).default(() => newDrawingScopeId()),
  /** Symbol id (from the symbols table). Null = empty panel awaiting a pick. */
  symbolId: z.string().min(1).max(40).nullable(),
  interval: IntervalSchema,
  /** Candle rendering style for this panel. */
  chartType: ChartTypeSchema.default('candle_solid'),
  /** Indicator ids active on this panel (main-pane overlays and sub panes). */
  indicators: z.array(z.string().min(1).max(60)).max(20).default([]),
});
export type Panel = z.infer<typeof PanelSchema>;

/** Cross-panel sync toggles. When on, an interaction in one panel propagates to the others. */
export const SyncSchema = z.object({
  symbol: z.boolean().default(false),
  interval: z.boolean().default(false),
  crosshair: z.boolean().default(true),
});
export type Sync = z.infer<typeof SyncSchema>;

export const LayoutConfigSchema = z
  .object({
    grid: GridSchema,
    panels: z.array(PanelSchema).min(1).max(16),
    sync: SyncSchema.default({ symbol: false, interval: false, crosshair: true }),
    /** Index of the focused panel (drives sync source + toolbar context). */
    activePanel: z.number().int().min(0).default(0),
  })
  .superRefine((cfg, ctx) => {
    const expected = panelCountFor(cfg.grid);
    if (cfg.panels.length !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `grid "${cfg.grid}" requires ${expected} panels, got ${cfg.panels.length}`,
        path: ['panels'],
      });
    }
    if (cfg.activePanel >= cfg.panels.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `activePanel ${cfg.activePanel} out of range`,
        path: ['activePanel'],
      });
    }
    const ids = new Set(cfg.panels.map((p) => p.id));
    if (ids.size !== cfg.panels.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'panel ids must be unique', path: ['panels'] });
    }
    const drawingScopes = new Set(cfg.panels.map((p) => p.drawingScopeId));
    if (drawingScopes.size !== cfg.panels.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'panel drawing scopes must be unique', path: ['panels'] });
    }
  });

export type LayoutConfig = z.infer<typeof LayoutConfigSchema>;

/** Build an empty panel with sensible defaults. */
export const makePanel = (symbolId: string | null = null, interval: Interval = '1h'): Panel => ({
  id: newPanelId(),
  drawingScopeId: newDrawingScopeId(),
  symbolId,
  interval,
  chartType: 'candle_solid',
  indicators: ['VOL'],
});

/** A fresh layout config for a given grid, optionally seeding the first panel's symbol. */
export const defaultLayoutConfig = (grid: GridKey = '1', firstSymbolId: string | null = null): LayoutConfig => {
  const count = panelCountFor(grid);
  const panels: Panel[] = Array.from({ length: count }, (_, i) =>
    makePanel(i === 0 ? firstSymbolId : null),
  );
  return {
    grid,
    panels,
    sync: { symbol: false, interval: false, crosshair: true },
    activePanel: 0,
  };
};

/**
 * Re-tile an existing config to a new grid, preserving as many existing panels as possible.
 * Growing adds empty panels; shrinking drops the trailing ones.
 */
export const reflowToGrid = (cfg: LayoutConfig, grid: GridKey): LayoutConfig => {
  const count = panelCountFor(grid);
  const panels = cfg.panels.slice(0, count);
  while (panels.length < count) panels.push(makePanel());
  const activePanel = Math.min(cfg.activePanel, panels.length - 1);
  return { ...cfg, grid, panels, activePanel };
};

/** Validate and normalize untrusted layout config (API edge). Throws ZodError on invalid shapes. */
export const parseLayoutConfig = (input: unknown): LayoutConfig => normalizeLayoutConfig(LayoutConfigSchema.parse(input));

/** Disable legacy interval sync and fill newer defaults for saved layout configs. */
export const normalizeLayoutConfig = (cfg: LayoutConfig): LayoutConfig => ({
  ...cfg,
  sync: { ...cfg.sync, interval: false },
  panels: cfg.panels.map((panel) => ({
    id: panel.id,
    drawingScopeId: panel.drawingScopeId,
    symbolId: panel.symbolId,
    interval: panel.interval,
    chartType: panel.chartType ?? 'candle_solid',
    indicators: panel.indicators ?? [],
  })),
});
