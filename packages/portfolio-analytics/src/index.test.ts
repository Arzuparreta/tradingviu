import { describe, expect, test } from 'bun:test';
import {
  computePortfolioAnalytics,
  PortfolioAnalyticsSchema,
  type AnalyticsPosition,
} from './index.js';

const fixture = (): AnalyticsPosition[] => [
  { symbolId: 'a', ticker: 'AAPL', quantity: 10, avgCost: 100, price: 120, assetClass: 'stock', sector: 'Tech' },
  { symbolId: 'm', ticker: 'MSFT', quantity: 5, avgCost: 200, price: 180, assetClass: 'stock', sector: 'Tech' },
  { symbolId: 'b', ticker: 'BTC', quantity: 2, avgCost: 100, price: 150, assetClass: 'crypto', sector: null },
];

describe('computePortfolioAnalytics', () => {
  test('totals: market value, cost basis, unrealized P&L', () => {
    const a = computePortfolioAnalytics(fixture());
    expect(a.marketValue).toBeCloseTo(2400, 9); // 1200 + 900 + 300
    expect(a.costBasis).toBeCloseTo(2200, 9); // 1000 + 1000 + 200
    expect(a.unrealizedPnl).toBeCloseTo(200, 9);
    expect(a.unrealizedPnlPct).toBeCloseTo(200 / 2200, 9);
    expect(a.positionsCount).toBe(3);
  });

  test('positions are weighted by market value and ordered desc', () => {
    const a = computePortfolioAnalytics(fixture());
    expect(a.positions.map((p) => p.ticker)).toEqual(['AAPL', 'MSFT', 'BTC']);
    expect(a.positions[0]!.weight).toBeCloseTo(0.5, 9);
    expect(a.positions[1]!.weight).toBeCloseTo(0.375, 9);
    expect(a.positions[2]!.weight).toBeCloseTo(0.125, 9);
    // P&L contribution is the signed share of total unrealized P&L (200).
    expect(a.positions[0]!.pnlContribution).toBeCloseTo(1, 9); // +200/200
    expect(a.positions[1]!.pnlContribution).toBeCloseTo(-0.5, 9); // -100/200
    expect(a.positions[2]!.unrealizedPnlPct).toBeCloseTo(0.5, 9); // BTC +50%
  });

  test('allocations group by asset class and sector', () => {
    const a = computePortfolioAnalytics(fixture());
    expect(a.byAssetClass).toEqual([
      { key: 'stock', marketValue: 2100, weight: 0.875 },
      { key: 'crypto', marketValue: 300, weight: 0.125 },
    ]);
    expect(a.bySector[0]).toEqual({ key: 'Tech', marketValue: 2100, weight: 0.875 });
    expect(a.bySector.find((s) => s.key === 'unknown')?.marketValue).toBe(300);
  });

  test('concentration uses the HHI of the weights', () => {
    const a = computePortfolioAnalytics(fixture());
    expect(a.concentration.hhi).toBeCloseTo(0.40625, 9); // .5²+.375²+.125²
    expect(a.concentration.topWeight).toBeCloseTo(0.5, 9);
    expect(a.concentration.top3Weight).toBeCloseTo(1, 9);
    expect(a.concentration.effectiveHoldings).toBeCloseTo(1 / 0.40625, 9);
  });

  test('best / worst by unrealized return', () => {
    const a = computePortfolioAnalytics(fixture());
    expect(a.best?.ticker).toBe('BTC'); // +50%
    expect(a.worst?.ticker).toBe('MSFT'); // −10%
  });

  test('empty portfolio is zeroed, null best/worst, schema-valid', () => {
    const a = computePortfolioAnalytics([]);
    expect(a.marketValue).toBe(0);
    expect(a.unrealizedPnlPct).toBe(0);
    expect(a.best).toBeNull();
    expect(a.worst).toBeNull();
    expect(a.concentration.effectiveHoldings).toBe(0);
    expect(() => PortfolioAnalyticsSchema.parse(a)).not.toThrow();
  });

  test('is deterministic', () => {
    expect(computePortfolioAnalytics(fixture())).toEqual(computePortfolioAnalytics(fixture()));
  });
});
