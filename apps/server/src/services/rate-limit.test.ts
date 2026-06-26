import { describe, expect, test } from 'bun:test';
import { rateWindowKey, evaluateRateLimit } from './rate-limit.js';

// A timestamp aligned to a 60s window boundary (ms divisible by 60_000).
const BASE = 1_700_000_040_000;

describe('rateWindowKey', () => {
  test('is stable within a window and changes across windows', () => {
    const w = 60;
    const a = rateWindowKey('abc', BASE, w);
    const b = rateWindowKey('abc', BASE + 59_000, w);
    const c = rateWindowKey('abc', BASE + 60_000, w);
    expect(a).toBe(b); // same 60s window
    expect(a).not.toBe(c); // next window
    expect(rateWindowKey('other', BASE, w)).not.toBe(a); // per identity
  });
});

describe('evaluateRateLimit', () => {
  const now = BASE + 20_000; // 20s into the window

  test('allows up to the limit, then blocks', () => {
    expect(evaluateRateLimit(1, 5, now, 60).allowed).toBe(true);
    expect(evaluateRateLimit(5, 5, now, 60).allowed).toBe(true);
    expect(evaluateRateLimit(6, 5, now, 60).allowed).toBe(false);
  });

  test('reports remaining and the window reset time', () => {
    const d = evaluateRateLimit(2, 5, now, 60);
    expect(d.remaining).toBe(3);
    expect(d.resetAt).toBe(BASE + 60_000);
  });

  test('remaining never goes negative', () => {
    expect(evaluateRateLimit(99, 5, now, 60).remaining).toBe(0);
  });
});
