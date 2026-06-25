import { describe, test, expect } from 'bun:test';
import {
  REPLAY_SPEEDS,
  replayStepMs,
  clampIndex,
  defaultReplayIndex,
  isReplayAtEnd,
  indexAtOrBefore,
  clampTime,
  defaultReplayTime,
  isTimeAtEnd,
} from '../src/lib/replay';

describe('replayStepMs', () => {
  test('1× is 700ms and scales inversely with speed', () => {
    expect(replayStepMs(1)).toBe(700);
    expect(replayStepMs(2)).toBe(350);
    expect(replayStepMs(10)).toBe(70);
    expect(replayStepMs(0.5)).toBe(1400);
  });

  test('clamps to a 30ms floor and tolerates non-positive speed', () => {
    expect(replayStepMs(1000)).toBe(30);
    expect(replayStepMs(0)).toBe(700);
    expect(replayStepMs(-1)).toBe(700);
  });

  test('every advertised speed maps to a positive interval', () => {
    for (const s of REPLAY_SPEEDS) expect(replayStepMs(s)).toBeGreaterThan(0);
  });
});

describe('clampIndex', () => {
  test('clamps into [0, len - 1]', () => {
    expect(clampIndex(-5, 10)).toBe(0);
    expect(clampIndex(5, 10)).toBe(5);
    expect(clampIndex(99, 10)).toBe(9);
  });

  test('returns -1 for an empty series', () => {
    expect(clampIndex(0, 0)).toBe(-1);
    expect(clampIndex(3, -2)).toBe(-1);
  });
});

describe('defaultReplayIndex', () => {
  test('reveals ~60% of the bars', () => {
    expect(defaultReplayIndex(500)).toBe(300);
    expect(defaultReplayIndex(10)).toBe(6);
    expect(defaultReplayIndex(1)).toBe(0);
    expect(defaultReplayIndex(0)).toBe(-1);
  });
});

describe('isReplayAtEnd', () => {
  test('true at or past the last bar', () => {
    expect(isReplayAtEnd(9, 10)).toBe(true);
    expect(isReplayAtEnd(8, 10)).toBe(false);
    expect(isReplayAtEnd(20, 10)).toBe(true);
    expect(isReplayAtEnd(0, 0)).toBe(true);
  });
});

describe('indexAtOrBefore', () => {
  const times = [100, 200, 300, 400, 500];

  test('finds the rightmost bar at or before a time', () => {
    expect(indexAtOrBefore(times, 300)).toBe(2); // exact hit
    expect(indexAtOrBefore(times, 350)).toBe(2); // between bars → earlier one
    expect(indexAtOrBefore(times, 500)).toBe(4); // last
    expect(indexAtOrBefore(times, 9999)).toBe(4); // beyond → last
  });

  test('returns -1 before the first bar or on an empty series', () => {
    expect(indexAtOrBefore(times, 50)).toBe(-1);
    expect(indexAtOrBefore([], 100)).toBe(-1);
  });
});

describe('time-based replay (multi-chart)', () => {
  test('clampTime keeps the cursor inside [min, max]', () => {
    expect(clampTime(150, 100, 200)).toBe(150);
    expect(clampTime(50, 100, 200)).toBe(100);
    expect(clampTime(999, 100, 200)).toBe(200);
    expect(clampTime(5, 100, 50)).toBe(100); // degenerate span
  });

  test('defaultReplayTime lands ~60% through the span', () => {
    expect(defaultReplayTime(100, 200)).toBe(160);
    expect(defaultReplayTime(0, 1000)).toBe(600);
    expect(defaultReplayTime(100, 100)).toBe(100); // empty span
  });

  test('isTimeAtEnd is true at or past the end', () => {
    expect(isTimeAtEnd(200, 200)).toBe(true);
    expect(isTimeAtEnd(199, 200)).toBe(false);
    expect(isTimeAtEnd(250, 200)).toBe(true);
  });
});
