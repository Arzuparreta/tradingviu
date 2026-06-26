import { describe, it, expect } from 'bun:test';
import {
  GRID_PRESETS,
  GRID_KEYS,
  panelCountFor,
  defaultLayoutConfig,
  reflowToGrid,
  parseLayoutConfig,
  makePanel,
  LayoutConfigSchema,
} from './index.js';

describe('grid presets', () => {
  it('panel count matches cols * rows for every preset', () => {
    for (const key of GRID_KEYS) {
      const p = GRID_PRESETS[key];
      expect(p.cols * p.rows).toBe(p.count);
      expect(panelCountFor(key)).toBe(p.count);
    }
  });
});

describe('defaultLayoutConfig', () => {
  it('produces a valid config with the right panel count', () => {
    const cfg = defaultLayoutConfig('4', 'sym_btc');
    expect(cfg.panels).toHaveLength(4);
    expect(cfg.panels[0]?.symbolId).toBe('sym_btc');
    expect(cfg.panels[1]?.symbolId).toBeNull();
    expect(() => parseLayoutConfig(cfg)).not.toThrow();
  });
});

describe('reflowToGrid', () => {
  it('grows by appending empty panels and stays valid', () => {
    const cfg = defaultLayoutConfig('1', 'sym_a');
    const grown = reflowToGrid(cfg, '4');
    expect(grown.panels).toHaveLength(4);
    expect(grown.panels[0]?.symbolId).toBe('sym_a');
    expect(() => parseLayoutConfig(grown)).not.toThrow();
  });

  it('shrinks by dropping trailing panels and clamps activePanel', () => {
    const cfg = { ...defaultLayoutConfig('4', 'sym_a'), activePanel: 3 };
    const shrunk = reflowToGrid(cfg, '1');
    expect(shrunk.panels).toHaveLength(1);
    expect(shrunk.activePanel).toBe(0);
    expect(() => parseLayoutConfig(shrunk)).not.toThrow();
  });
});

describe('parseLayoutConfig validation', () => {
  it('rejects a panel count that does not match the grid', () => {
    const bad = { grid: '4', panels: [makePanel()], sync: { symbol: false, interval: false, crosshair: true }, activePanel: 0 };
    expect(() => parseLayoutConfig(bad)).toThrow();
  });

  it('rejects duplicate panel ids', () => {
    const dupe = makePanel('sym_a');
    const bad = {
      grid: '2',
      panels: [dupe, { ...dupe }],
      sync: { symbol: false, interval: false, crosshair: true },
      activePanel: 0,
    };
    expect(() => parseLayoutConfig(bad)).toThrow();
  });

  it('applies sync defaults when omitted', () => {
    const cfg = defaultLayoutConfig('2');
    const parsed = LayoutConfigSchema.parse({ grid: cfg.grid, panels: cfg.panels });
    expect(parsed.sync).toEqual({ symbol: false, interval: false, crosshair: true });
    expect(parsed.activePanel).toBe(0);
  });

  it('normalizes legacy interval sync off', () => {
    const cfg = defaultLayoutConfig('2');
    const parsed = parseLayoutConfig({ ...cfg, sync: { symbol: false, interval: true, crosshair: true } });
    expect(parsed.sync.interval).toBe(false);
  });

  it('keeps drawings scoped per panel', () => {
    const cfg = defaultLayoutConfig('2', 'sym_a');
    const parsed = parseLayoutConfig({
      ...cfg,
      panels: [
        { ...cfg.panels[0]!, drawings: [{ id: 'd1', kind: 'horizontal-line', points: [{ time: 1, price: 10 }], style: { color: '#fff', width: 1, lineStyle: 'solid' }, createdAt: 1, updatedAt: 1 }] },
        { ...cfg.panels[1]!, symbolId: 'sym_a', interval: '1h', drawings: [] },
      ],
    });
    expect(parsed.panels[0]?.drawings).toHaveLength(1);
    expect(parsed.panels[1]?.drawings).toHaveLength(0);
  });
});
