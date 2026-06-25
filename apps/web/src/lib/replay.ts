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
