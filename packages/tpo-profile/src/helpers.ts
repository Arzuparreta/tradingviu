/** Clamp `x` into the inclusive range `[lo, hi]`. */
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Letter for the `i`-th TPO period (0-based), following the Market Profile
 * convention: A–Z for the first 26 periods, then a–z, then wrapping back to A.
 * Single-character so the letter ladder stays column-aligned in a monospace
 * font; the row `count` is the authoritative metric when periods exceed 52.
 */
export const periodLabel = (i: number): string => {
  const n = ((i % 52) + 52) % 52;
  return n < 26 ? UPPER[n]! : LOWER[n - 26]!;
};
