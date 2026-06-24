import { describe, expect, test } from 'bun:test';
import {
  FmpCalendarProvider,
  MockCalendarProvider,
  fetchNormalizedCalendar,
  normalizeEarningsEvent,
  normalizeEconomicEvent,
} from './index.js';

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('calendar provider normalization', () => {
  test('uppercases earnings symbol and coerces numeric eps', () => {
    const event = normalizeEarningsEvent(
      {
        symbol: 'aapl',
        date: '2026-07-02T20:00:00.000Z',
        epsEstimate: 1.42,
        revenueEstimate: '89.3B',
      },
      new Date('2026-06-24T12:00:00.000Z'),
    );

    expect(event.symbol).toBe('AAPL');
    expect(event.epsEstimate).toBe('1.42');
    expect(event.revenueEstimate).toBe('89.3B');
    expect(event.epsActual).toBeUndefined();
  });

  test('defaults economic importance to low and uppercases country', () => {
    const event = normalizeEconomicEvent(
      {
        country: 'us',
        eventAt: '2026-06-26T12:30:00.000Z',
        name: 'Core PCE Price Index',
        forecast: '0.2%',
      },
      new Date('2026-06-24T12:00:00.000Z'),
    );

    expect(event.country).toBe('US');
    expect(event.importance).toBe('low');
    expect(event.actual).toBeUndefined();
  });

  test('mock provider returns earnings, dividends, and economic events', async () => {
    const result = await fetchNormalizedCalendar(new MockCalendarProvider(), { limit: 10 });

    expect(result.earnings.length).toBeGreaterThan(0);
    expect(result.dividends.length).toBeGreaterThan(0);
    expect(result.economic.length).toBeGreaterThan(0);
    expect(result.earnings[0]?.symbol).toBe('AAPL');
    expect(result.dividends[0]?.amount).toBe('0.26');
  });

  test('mock provider filters by requested symbols', async () => {
    const result = await fetchNormalizedCalendar(new MockCalendarProvider(), { symbols: ['MSFT'] });

    expect(result.earnings.every((event) => event.symbol === 'MSFT')).toBe(true);
    expect(result.dividends.every((event) => event.symbol === 'MSFT')).toBe(true);
  });

  test('FMP provider maps responses without real network', async () => {
    const fetcher = async (url: URL | RequestInfo): Promise<Response> => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/earning_calendar')) {
        return jsonResponse([
          {
            date: '2026-07-02',
            symbol: 'AAPL',
            epsEstimated: 1.42,
            revenueEstimated: 89_300_000_000,
            eps: null,
            revenue: null,
          },
        ]);
      }
      if (path.endsWith('/stock_dividend_calendar')) {
        return jsonResponse([
          {
            date: '2026-08-11',
            symbol: 'AAPL',
            dividend: 0.26,
            recordDate: '2026-08-12',
            paymentDate: '2026-08-18',
            declarationDate: '2026-07-31',
          },
        ]);
      }
      if (path.endsWith('/economic_calendar')) {
        return jsonResponse([
          {
            event: 'Nonfarm Payrolls',
            date: '2026-07-02T12:30:00.000Z',
            country: 'US',
            actual: null,
            previous: '139K',
            estimate: '180K',
            impact: 'High',
          },
        ]);
      }
      return jsonResponse([]);
    };

    const provider = new FmpCalendarProvider('demo-key', 'https://fmp.example.test', fetcher);
    const result = await fetchNormalizedCalendar(provider, {
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-31T00:00:00.000Z'),
    });

    expect(result.earnings).toHaveLength(1);
    expect(result.earnings[0]?.epsEstimate).toBe('1.42');
    expect(result.earnings[0]?.revenueEstimate).toBe('89300000000');
    expect(result.dividends).toHaveLength(1);
    expect(result.dividends[0]?.amount).toBe('0.26');
    expect(result.economic).toHaveLength(1);
    expect(result.economic[0]?.importance).toBe('high');
    expect(result.economic[0]?.forecast).toBe('180K');
  });
});
