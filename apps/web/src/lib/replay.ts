/**
 * Pure helpers for Bar Replay. No React, no chart, no I/O — just the index and
 * timing math, so the replay behaviour is deterministic and unit-testable.
 */

/** Playback speeds offered in the replay toolbar (× real step rate). */
export const REPLAY_SPEEDS = [0.5, 1, 2, 5, 10] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** Milliseconds between auto-advance steps for a speed (1× = 700ms/bar). */
export const replayStepMs = (speed: number): number => {
  const s = speed > 0 ? speed : 1;
  return Math.max(30, Math.round(700 / s));
};

/** Clamp `i` into `[0, len - 1]`; returns -1 for an empty series. */
export const clampIndex = (i: number, len: number): number => {
  if (len <= 0) return -1;
  if (i < 0) return 0;
  if (i > len - 1) return len - 1;
  return i;
};

/**
 * Default replay cursor when entering replay: reveal the first ~60% of bars and
 * leave the rest to play forward. Returns the index of the last visible bar.
 */
export const defaultReplayIndex = (len: number): number =>
  len <= 0 ? -1 : clampIndex(Math.floor(len * 0.6), len);

/** True once the cursor has reached (or passed) the final bar. */
export const isReplayAtEnd = (index: number, len: number): boolean =>
  len <= 0 || index >= len - 1;

/** Clamp a replay cursor *time* into `[min, max]` (degenerate span → `min`). */
export const clampTime = (t: number, min: number, max: number): number => {
  if (min > max) return min;
  if (t < min) return min;
  if (t > max) return max;
  return t;
};

/**
 * Default multi-chart replay cursor: ~60% through the global time span, so a
 * chunk of history is visible and the rest plays forward. Used when entering
 * replay across a layout of charts that share a time axis but not an index.
 */
export const defaultReplayTime = (min: number, max: number): number =>
  max <= min ? min : min + Math.round((max - min) * 0.6);

/** True once the cursor time has reached (or passed) the end of the span. */
export const isTimeAtEnd = (t: number, max: number): boolean => t >= max;

/**
 * Index of the rightmost bar whose time is `<= time` — the bar to stop the
 * replay at when the user clicks at `time`. `times` must be ascending.
 * Returns -1 when `time` precedes the first bar (or the series is empty).
 */
export const indexAtOrBefore = (times: readonly number[], time: number): number => {
  let lo = 0;
  let hi = times.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= time) {
      res = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return res;
};
