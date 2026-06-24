import { describe, expect, test } from 'bun:test';
import type { Bar } from '@tv/data-types';
import { evaluateAlertCondition } from './alert-engine.js';
import { computeHoldings } from './portfolio-engine.js';
import { executePaperOrder } from './paper-trading.js';

const bars: Bar[] = [
  { time: 1, open: 90, high: 101, low: 89, close: 100, volume: 10 },
  { time: 2, open: 100, high: 111, low: 99, close: 110, volume: 10 },
];

describe('slice 4 engines', () => {
  test('evaluates price crosses', () => {
    const result = evaluateAlertCondition(
      { type: 'price', operator: 'crosses_above', value: 105 },
      { price: 110, previousPrice: 100, bars },
    );
    expect(result.fired).toBe(true);
    expect(result.value).toBe(110);
  });

  test('rebuilds portfolio holdings and realized pnl', () => {
    const result = computeHoldings([
      {
        id: '1',
        symbolId: 'BTC',
        side: 'buy',
        quantity: '2',
        price: '100',
        fee: '0',
        occurredAt: new Date('2026-01-01T00:00:00Z'),
        note: null,
      },
      {
        id: '2',
        symbolId: 'BTC',
        side: 'sell',
        quantity: '0.5',
        price: '120',
        fee: '1',
        occurredAt: new Date('2026-01-02T00:00:00Z'),
        note: null,
      },
    ]);
    expect(result.holdings).toEqual([{ symbolId: 'BTC', quantity: 1.5, avgCost: 100 }]);
    expect(result.metrics.realizedPnl).toBe(9);
  });

  test('fills market paper orders with fee and slippage', () => {
    const fill = executePaperOrder({
      symbolId: 'BTC',
      side: 'buy',
      type: 'market',
      quantity: 2,
      lastPrice: 100,
      slippageBps: 10,
      feeBps: 5,
    });
    expect(fill.status).toBe('filled');
    expect(fill.fillPrice).toBe(100.1);
    expect(fill.fee).toBeCloseTo(0.1001);
    expect(fill.cashDelta).toBeCloseTo(-200.3001);
  });
});
