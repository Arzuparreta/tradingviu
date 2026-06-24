import { describe, it, expect } from 'bun:test';
import type { Bar } from '@tv/data-types';
import { compileAndRun, validate } from './index.js';
import * as ta from './series.js';

const bar = (i: number, close: number): Bar => ({ time: i * 60, open: close, high: close + 1, low: close - 1, close, volume: 100 });
const closes = (vals: number[]): Bar[] => vals.map((v, i) => bar(i, v));

describe('series math', () => {
  it('sma warms up then averages the window', () => {
    expect(ta.sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  it('change is the first difference', () => {
    expect(ta.change([10, 12, 9])).toEqual([null, 2, -3]);
  });

  it('highest/lowest over a window', () => {
    expect(ta.highest([1, 3, 2, 5], 2)).toEqual([null, 3, 3, 5]);
    expect(ta.lowest([1, 3, 2, 5], 2)).toEqual([null, 1, 2, 2]);
  });

  it('rsi of a strictly rising series is 100', () => {
    const r = ta.rsi([1, 2, 3, 4, 5, 6, 7, 8], 3);
    expect(r.at(-1)).toBe(100);
  });

  it('ema seeds with sma and stays within range', () => {
    const e = ta.ema([1, 2, 3, 4, 5], 3);
    expect(e[0]).toBeNull();
    expect(e[1]).toBeNull();
    expect(e[2]).toBeCloseTo(2, 5); // sma(1,2,3)
    expect(e[3]!).toBeGreaterThan(2);
  });
});

describe('compileAndRun', () => {
  it('runs an SMA indicator and produces a plot', () => {
    const src = `//@version=5
indicator("SMA demo", overlay=true)
len = input.int(3, title="Length")
out = ta.sma(close, len)
plot(out, title="MA", color=color.blue)`;
    const res = compileAndRun(src, closes([10, 11, 12, 13, 14]));
    expect(res.title).toBe('SMA demo');
    expect(res.overlay).toBe(true);
    expect(res.inputs).toHaveLength(1);
    expect(res.inputs[0]).toMatchObject({ name: 'Length', type: 'int', value: 3 });
    expect(res.plots).toHaveLength(1);
    expect(res.plots[0]!.title).toBe('MA');
    expect(res.plots[0]!.color).toBe('#2962ff');
    expect(res.plots[0]!.data).toEqual([null, null, 11, 12, 13]);
  });

  it('applies input overrides by title', () => {
    const src = `indicator("x")
len = input.int(2, title="Length")
plot(ta.sma(close, len))`;
    const res = compileAndRun(src, closes([10, 20, 30, 40]), { Length: 3 });
    expect(res.inputs[0]!.value).toBe(3);
    expect(res.plots[0]!.data).toEqual([null, null, 20, 30]);
  });

  it('evaluates arithmetic on series and the ternary', () => {
    const src = `indicator("x")
hl = (high + low) / 2
sig = close > open ? 1 : 0
plot(hl)
plot(sig)`;
    const res = compileAndRun(src, closes([10, 11, 12]));
    // high=close+1, low=close-1 → hl == close
    expect(res.plots[0]!.data).toEqual([10, 11, 12]);
    // close === open in our fixture, so close > open is false → 0
    expect(res.plots[1]!.data).toEqual([0, 0, 0]);
  });

  it('supports hline', () => {
    const res = compileAndRun('indicator("x")\nhline(50, title="mid")', closes([1, 2]));
    expect(res.plots[0]).toMatchObject({ type: 'hline', title: 'mid', data: [50, 50] });
  });
});

describe('validate', () => {
  it('accepts a valid script and returns metadata', () => {
    const v = validate('//@version=5\nindicator("Ok", overlay=true)\nplot(close)');
    expect(v.ok).toBe(true);
    expect(v.meta).toMatchObject({ title: 'Ok', overlay: true });
  });

  it('reports a parse error with location', () => {
    const v = validate('x = (1 + ');
    expect(v.ok).toBe(false);
    expect(v.error?.kind).toBe('parse');
    expect(v.error?.line).toBeGreaterThan(0);
  });

  it('reports an unknown-function runtime error', () => {
    const v = validate('indicator("x")\nplot(ta.nope(close, 5))');
    expect(v.ok).toBe(false);
    expect(v.error?.kind).toBe('runtime');
    expect(v.error?.message).toContain('ta.nope');
  });

  it('reports an undefined variable', () => {
    const v = validate('plot(undefinedvar)');
    expect(v.ok).toBe(false);
    expect(v.error?.message).toContain('undefinedvar');
  });
});
