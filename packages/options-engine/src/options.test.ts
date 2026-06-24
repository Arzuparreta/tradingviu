import { describe, expect, test } from 'bun:test';
import { impliedVolatility, optionGreeks, optionPrice } from './black-scholes.js';
import { buildChain } from './chain.js';
import { analyzeStrategy, buildAndAnalyze, type PricedLeg } from './strategy.js';
import type { Greeks } from './types.js';

// Textbook reference: S=100, K=100, T=1, r=0.05, vol=0.2, q=0
const base = { spot: 100, strike: 100, timeToExpiry: 1, rate: 0.05, volatility: 0.2, dividendYield: 0 } as const;
const zeroGreeks: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };

describe('black-scholes pricing', () => {
  test('prices an ATM call and put to textbook values', () => {
    expect(optionPrice({ ...base, type: 'call' })).toBeCloseTo(10.4506, 3);
    expect(optionPrice({ ...base, type: 'put' })).toBeCloseTo(5.5735, 3);
  });

  test('respects put-call parity (C - P = S - K e^-rT)', () => {
    const call = optionPrice({ ...base, type: 'call' });
    const put = optionPrice({ ...base, type: 'put' });
    expect(call - put).toBeCloseTo(100 - 100 * Math.exp(-0.05), 6);
  });

  test('computes call greeks', () => {
    const g = optionGreeks({ ...base, type: 'call' });
    expect(g.delta).toBeCloseTo(0.6368, 3);
    expect(g.gamma).toBeCloseTo(0.018762, 5);
    expect(optionGreeks({ ...base, type: 'put' }).delta).toBeCloseTo(-0.3632, 3);
  });

  test('falls back to intrinsic at/after expiry', () => {
    expect(optionPrice({ ...base, type: 'call', timeToExpiry: 0, spot: 120 })).toBe(20);
  });
});

describe('implied volatility', () => {
  test('round-trips a priced option back to its input vol', () => {
    const price = optionPrice({ ...base, type: 'call' });
    const iv = impliedVolatility(price, { type: 'call', spot: 100, strike: 100, timeToExpiry: 1, rate: 0.05 });
    expect(iv).toBeCloseTo(0.2, 4);
  });

  test('returns 0 when price has no extrinsic value', () => {
    expect(impliedVolatility(20, { type: 'call', spot: 120, strike: 100, timeToExpiry: 1, rate: 0 })).toBe(0);
  });
});

describe('option chain', () => {
  test('generates symmetric strikes with call/put quotes', () => {
    const chain = buildChain({ spot: 100, expiries: [0.25, 0.5], rate: 0.05, volatility: 0.3, strikeStep: 5, strikeCount: 5 });
    expect(chain).toHaveLength(2);
    const first = chain[0]!;
    expect(first.strikes.map((s) => s.strike)).toEqual([90, 95, 100, 105, 110]);
    const atm = first.strikes.find((s) => s.strike === 100)!;
    expect(atm.call.extrinsic).toBeGreaterThan(0);
    expect(atm.call.price).toBeCloseTo(atm.call.intrinsic + atm.call.extrinsic, 6);
  });
});

describe('strategy analysis', () => {
  test('analyzes a bull call spread (bounded both sides)', () => {
    const legs: PricedLeg[] = [
      { type: 'call', side: 'long', strike: 100, quantity: 1, expiry: 0.25, premium: 10, greeks: zeroGreeks },
      { type: 'call', side: 'short', strike: 110, quantity: 1, expiry: 0.25, premium: 4, greeks: zeroGreeks },
    ];
    const a = analyzeStrategy(legs, { priceMin: 80, priceMax: 130, steps: 51 });
    expect(a.netDebit).toBe(6); // pay 10, collect 4
    expect(a.maxLoss).toBe(-6);
    expect(a.maxProfit).toBe(4); // width(10) - debit(6)
    expect(a.breakevens).toEqual([106]);
  });

  test('analyzes a long straddle (unlimited upside)', () => {
    const legs: PricedLeg[] = [
      { type: 'call', side: 'long', strike: 100, quantity: 1, expiry: 0.25, premium: 10, greeks: zeroGreeks },
      { type: 'put', side: 'long', strike: 100, quantity: 1, expiry: 0.25, premium: 8, greeks: zeroGreeks },
    ];
    const a = analyzeStrategy(legs, { priceMin: 50, priceMax: 150, steps: 101 });
    expect(a.maxProfit).toBe(Infinity);
    expect(a.maxLoss).toBe(-18);
    expect(a.breakevens).toEqual([82, 118]);
  });

  test('builds and prices a template end-to-end', () => {
    const a = buildAndAnalyze('long_call', {
      spot: 100,
      rate: 0.05,
      volatility: 0.2,
      timeToExpiry: 1,
    });
    expect(a.legs).toHaveLength(1);
    expect(a.legs[0]!.premium).toBeCloseTo(10.4506, 3);
    expect(a.netDebit).toBeCloseTo(10.4506, 3);
    expect(a.netGreeks.delta).toBeCloseTo(0.6368, 3);
    expect(a.maxProfit).toBe(Infinity);
  });
});
