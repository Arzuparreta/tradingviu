import { describe, expect, test } from 'bun:test';
import {
  FredMacroProvider,
  MockMacroProvider,
  fetchNormalizedMacro,
  normalizeMacroObservation,
} from './index.js';

describe('macro provider normalization', () => {
  test('normalizes country and metric code', () => {
    const fetchedAt = new Date('2026-06-24T12:00:00.000Z');
    const observation = normalizeMacroObservation(
      { id: 'mock', displayName: 'Mock Macro' },
      {
        country: 'us',
        metricCode: 'fedfunds',
        metricName: 'Fed Funds',
        observedAt: '2026-05-31T00:00:00.000Z',
        value: 4.83,
        unit: '%',
        frequency: 'monthly',
      },
      fetchedAt,
    );

    expect(observation.country).toBe('US');
    expect(observation.metricCode).toBe('FEDFUNDS');
    expect(observation.source).toBe('Mock Macro');
  });

  test('mock provider returns curve points and macro observations', async () => {
    const result = await fetchNormalizedMacro(new MockMacroProvider(), {
      country: 'US',
      limit: 2,
    });

    expect(result.yieldCurvePoints).toHaveLength(5);
    expect(result.macroObservations).toHaveLength(2);
    expect(result.yieldCurvePoints[0]?.source).toBe('Tradingviu Macro Mock');
  });

  test('FRED provider maps latest observations without real network', async () => {
    const fetcher = async (url: URL | RequestInfo) => {
      const seriesId = new URL(String(url)).searchParams.get('series_id');
      const value = seriesId === 'CPIAUCSL' ? '321.4' : '4.5';
      return new Response(
        JSON.stringify({
          observations: [
            { date: '2026-06-01', value: '.' },
            { date: '2026-05-01', value },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const provider = new FredMacroProvider('demo-key', 'https://api.example.test', fetcher);
    const result = await fetchNormalizedMacro(provider, { country: 'US', limit: 1 });

    expect(result.yieldCurvePoints).toHaveLength(5);
    expect(result.macroObservations).toHaveLength(1);
    expect(result.macroObservations[0]?.metricCode).toBe('CPIAUCSL');
    expect(result.macroObservations[0]?.value).toBe(321.4);
  });
});
