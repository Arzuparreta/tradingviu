import { describe, expect, test } from 'bun:test';
import type { Bar } from '@tv/data-types';
import { computePivotPoints } from './pivots.js';
import { PivotPointsSchema, type PivotSet } from './types.js';

const bar = (iso: string, open: number, high: number, low: number, close: number): Bar => ({
  time: Math.floor(Date.parse(iso) / 1000),
  open,
  high,
  low,
  close,
  volume: 1,
});

// Prior day (Jan 1): H=110, L=90, C=100, O=95. Current day (Jan 2): open=102.
const twoDays = (): Bar[] => [
  bar('2024-01-01T00:00:00Z', 95, 100, 90, 98),
  bar('2024-01-01T12:00:00Z', 98, 110, 95, 100),
  bar('2024-01-02T00:00:00Z', 102, 104, 101, 103),
  bar('2024-01-02T12:00:00Z', 103, 106, 100, 104),
];

const val = (set: PivotSet, name: string): number =>
  set.levels.find((l) => l.name === name)!.value;

describe('computePivotPoints', () => {
  test('groups bars into prior/current periods with the right basis', () => {
    const p = computePivotPoints(twoDays(), { method: 'standard', period: 'D' });
    expect(p.periodCount).toBe(2);
    expect(p.sets).toHaveLength(1);
    const s = p.latest!;
    expect(s.basisHigh).toBe(110);
    expect(s.basisLow).toBe(90);
    expect(s.basisClose).toBe(100);
    expect(s.basisOpen).toBe(95);
    expect(s.startTime).toBe(Math.floor(Date.parse('2024-01-02T00:00:00Z') / 1000));
    expect(() => PivotPointsSchema.parse(p)).not.toThrow();
  });

  test('standard levels match the textbook formulas', () => {
    const s = computePivotPoints(twoDays(), { method: 'standard' }).latest!;
    expect(val(s, 'PP')).toBeCloseTo(100, 9); // (110+90+100)/3
    expect(val(s, 'R1')).toBeCloseTo(110, 9); // 2·PP − L
    expect(val(s, 'S1')).toBeCloseTo(90, 9); // 2·PP − H
    expect(val(s, 'R2')).toBeCloseTo(120, 9); // PP + (H−L)
    expect(val(s, 'S2')).toBeCloseTo(80, 9);
    expect(val(s, 'R3')).toBeCloseTo(130, 9);
    expect(val(s, 'S3')).toBeCloseTo(70, 9);
  });

  test('fibonacci uses 0.382 / 0.618 / 1.0 of the range', () => {
    const s = computePivotPoints(twoDays(), { method: 'fibonacci' }).latest!;
    expect(val(s, 'PP')).toBeCloseTo(100, 9);
    expect(val(s, 'R1')).toBeCloseTo(107.64, 6); // 100 + 0.382·20
    expect(val(s, 'R2')).toBeCloseTo(112.36, 6); // 100 + 0.618·20
    expect(val(s, 'R3')).toBeCloseTo(120, 9);
  });

  test('camarilla spreads R1–R4 / S1–S4 from the close', () => {
    const s = computePivotPoints(twoDays(), { method: 'camarilla' }).latest!;
    expect(val(s, 'R4')).toBeCloseTo(111, 6); // C + range·1.1/2
    expect(val(s, 'S4')).toBeCloseTo(89, 6);
    expect(val(s, 'PP')).toBeCloseTo(100, 9);
  });

  test('woodie folds in the current period open', () => {
    const s = computePivotPoints(twoDays(), { method: 'woodie' }).latest!;
    expect(val(s, 'PP')).toBeCloseTo(101, 9); // (110+90+2·102)/4
    expect(val(s, 'R1')).toBeCloseTo(112, 9); // 2·PP − L
  });

  test('demark switches on prior close vs open', () => {
    const s = computePivotPoints(twoDays(), { method: 'demark' }).latest!;
    // C(100) > O(95) → X = 2H+L+C = 410
    expect(val(s, 'PP')).toBeCloseTo(102.5, 9); // X/4
    expect(val(s, 'R1')).toBeCloseTo(115, 9); // X/2 − L
    expect(val(s, 'S1')).toBeCloseTo(95, 9); // X/2 − H
  });

  test('a single period yields no levels (no prior)', () => {
    const p = computePivotPoints(twoDays().slice(0, 2), { period: 'D' });
    expect(p.periodCount).toBe(1);
    expect(p.sets).toHaveLength(0);
    expect(p.latest).toBeNull();
  });

  test('empty input is valid and empty', () => {
    const p = computePivotPoints([]);
    expect(p.periodCount).toBe(0);
    expect(p.latest).toBeNull();
    expect(() => PivotPointsSchema.parse(p)).not.toThrow();
  });

  test('weekly grouping splits across the Monday boundary', () => {
    // 2024-01-07 is a Sunday; 2024-01-08 is the next Monday → two weeks.
    const bars = [
      bar('2024-01-05T00:00:00Z', 10, 12, 9, 11),
      bar('2024-01-07T00:00:00Z', 11, 13, 10, 12),
      bar('2024-01-08T00:00:00Z', 12, 14, 11, 13),
    ];
    const p = computePivotPoints(bars, { period: 'W' });
    expect(p.periodCount).toBe(2);
    expect(p.sets).toHaveLength(1);
  });

  test('is deterministic', () => {
    const a = computePivotPoints(twoDays(), { method: 'camarilla', period: 'D' });
    const b = computePivotPoints(twoDays(), { method: 'camarilla', period: 'D' });
    expect(a).toEqual(b);
  });
});
