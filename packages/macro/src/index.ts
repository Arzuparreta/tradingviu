import {
  MacroIngestQuerySchema,
  MacroSeriesProviderObservationSchema,
  NormalizedMacroSeriesObservationSchema,
  NormalizedYieldCurvePointSchema,
  YieldCurveProviderPointSchema,
  type MacroIngestQuery,
  type MacroSeriesProviderObservation,
  type NormalizedMacroSeriesObservation,
  type NormalizedYieldCurvePoint,
  type YieldCurveProviderPoint,
} from '@tv/core';

export interface MacroProviderHealth {
  readonly ok: boolean;
  readonly checkedAt: Date;
  readonly message?: string;
}

export interface MacroProviderResult {
  readonly yieldCurvePoints: readonly YieldCurveProviderPoint[];
  readonly macroObservations: readonly MacroSeriesProviderObservation[];
}

export interface MacroProvider {
  readonly id: string;
  readonly displayName: string;
  fetchMacro(query: MacroIngestQuery): Promise<MacroProviderResult>;
  healthCheck(): Promise<MacroProviderHealth>;
}

export class MacroProviderError extends Error {
  public override readonly name = 'MacroProviderError';
  public override readonly cause?: unknown;
  public readonly provider: string;

  public constructor(provider: string, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.provider = provider;
    if (cause !== undefined) this.cause = cause;
  }
}

export const normalizeYieldCurvePoint = (
  provider: Pick<MacroProvider, 'id' | 'displayName'>,
  point: unknown,
  fetchedAt: Date,
): NormalizedYieldCurvePoint => {
  const parsed = YieldCurveProviderPointSchema.parse(point);
  return NormalizedYieldCurvePointSchema.parse({
    ...parsed,
    country: parsed.country.toUpperCase(),
    source: parsed.source ?? provider.displayName,
    fetchedAt,
  });
};

export const normalizeMacroObservation = (
  provider: Pick<MacroProvider, 'id' | 'displayName'>,
  observation: unknown,
  fetchedAt: Date,
): NormalizedMacroSeriesObservation => {
  const parsed = MacroSeriesProviderObservationSchema.parse(observation);
  return NormalizedMacroSeriesObservationSchema.parse({
    ...parsed,
    country: parsed.country.toUpperCase(),
    metricCode: parsed.metricCode.toUpperCase(),
    source: parsed.source ?? provider.displayName,
    fetchedAt,
  });
};

export const fetchNormalizedMacro = async (
  provider: MacroProvider,
  queryInput: unknown,
  fetchedAt = new Date(),
): Promise<{
  readonly yieldCurvePoints: readonly NormalizedYieldCurvePoint[];
  readonly macroObservations: readonly NormalizedMacroSeriesObservation[];
}> => {
  const query = MacroIngestQuerySchema.parse(queryInput);
  const raw = await provider.fetchMacro(query);
  return {
    yieldCurvePoints: raw.yieldCurvePoints.map((point) =>
      normalizeYieldCurvePoint(provider, point, fetchedAt),
    ),
    macroObservations: raw.macroObservations.map((observation) =>
      normalizeMacroObservation(provider, observation, fetchedAt),
    ),
  };
};

const mockCurveDate = new Date('2026-06-23T00:00:00.000Z');

export class MockMacroProvider implements MacroProvider {
  public readonly id = 'mock';
  public readonly displayName = 'Tradingviu Macro Mock';

  public async fetchMacro(queryInput: MacroIngestQuery): Promise<MacroProviderResult> {
    const query = MacroIngestQuerySchema.parse(queryInput);
    const country = query.country.toUpperCase();
    const macroObservations: readonly MacroSeriesProviderObservation[] = [
      {
        country,
        metricCode: 'CPI_YOY',
        metricName: 'Consumer Price Index YoY',
        observedAt: new Date('2026-05-31T00:00:00.000Z'),
        value: 2.8,
        unit: '%',
        frequency: 'monthly',
        source: this.displayName,
      },
      {
        country,
        metricCode: 'UNRATE',
        metricName: 'Unemployment Rate',
        observedAt: new Date('2026-05-31T00:00:00.000Z'),
        value: 4.1,
        unit: '%',
        frequency: 'monthly',
        source: this.displayName,
      },
      {
        country,
        metricCode: 'FEDFUNDS',
        metricName: 'Effective Federal Funds Rate',
        observedAt: new Date('2026-05-31T00:00:00.000Z'),
        value: 4.83,
        unit: '%',
        frequency: 'monthly',
        source: this.displayName,
      },
    ];

    return {
      yieldCurvePoints: [3, 24, 60, 120, 360].map((tenorMonths, index) => ({
        country,
        curveDate: mockCurveDate,
        tenorMonths,
        rate: [4.82, 4.61, 4.43, 4.38, 4.72][index] ?? 0,
        currency: 'USD',
        source: this.displayName,
      })),
      macroObservations: macroObservations.slice(0, query.limit),
    };
  }

  public async healthCheck(): Promise<MacroProviderHealth> {
    return { ok: true, checkedAt: new Date('2026-06-24T00:00:00.000Z') };
  }
}

interface FredSeriesConfig {
  readonly seriesId: string;
  readonly metricCode: string;
  readonly metricName: string;
  readonly unit: string;
  readonly frequency: string;
}

interface FredYieldConfig {
  readonly seriesId: string;
  readonly tenorMonths: number;
}

const fredMacroSeries: readonly FredSeriesConfig[] = [
  {
    seriesId: 'CPIAUCSL',
    metricCode: 'CPIAUCSL',
    metricName: 'Consumer Price Index',
    unit: 'index',
    frequency: 'monthly',
  },
  {
    seriesId: 'UNRATE',
    metricCode: 'UNRATE',
    metricName: 'Unemployment Rate',
    unit: '%',
    frequency: 'monthly',
  },
  {
    seriesId: 'GDP',
    metricCode: 'GDP',
    metricName: 'Gross Domestic Product',
    unit: 'billions USD',
    frequency: 'quarterly',
  },
  {
    seriesId: 'FEDFUNDS',
    metricCode: 'FEDFUNDS',
    metricName: 'Effective Federal Funds Rate',
    unit: '%',
    frequency: 'monthly',
  },
];

const fredYieldSeries: readonly FredYieldConfig[] = [
  { seriesId: 'DGS3MO', tenorMonths: 3 },
  { seriesId: 'DGS2', tenorMonths: 24 },
  { seriesId: 'DGS5', tenorMonths: 60 },
  { seriesId: 'DGS10', tenorMonths: 120 },
  { seriesId: 'DGS30', tenorMonths: 360 },
];

type Fetcher = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

interface FredObservation {
  readonly date: string;
  readonly value: string;
}

const parseFredObservation = (value: unknown): FredObservation | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.date !== 'string' || typeof record.value !== 'string') return undefined;
  const numeric = Number(record.value);
  if (!Number.isFinite(numeric)) return undefined;
  return { date: record.date, value: record.value };
};

export class FredMacroProvider implements MacroProvider {
  public readonly id = 'fred';
  public readonly displayName = 'FRED';

  public constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.stlouisfed.org',
    private readonly fetcher: Fetcher = fetch,
  ) {
    if (!apiKey.trim()) throw new MacroProviderError(this.id, 'FRED_KEY is required');
  }

  public async fetchMacro(queryInput: MacroIngestQuery): Promise<MacroProviderResult> {
    const query = MacroIngestQuerySchema.parse(queryInput);
    const country = query.country.toUpperCase();
    if (country !== 'US') {
      throw new MacroProviderError(
        this.id,
        'FRED provider currently supports MACRO_INGEST_COUNTRY=US',
      );
    }

    const yieldCurvePoints: YieldCurveProviderPoint[] = [];
    for (const config of fredYieldSeries) {
      const observation = await this.fetchLatestObservation(config.seriesId, query);
      if (!observation) continue;
      yieldCurvePoints.push({
        country,
        curveDate: new Date(`${observation.date}T00:00:00.000Z`),
        tenorMonths: config.tenorMonths,
        rate: Number(observation.value),
        currency: 'USD',
        source: this.displayName,
      });
    }

    const macroObservations: MacroSeriesProviderObservation[] = [];
    for (const config of fredMacroSeries.slice(0, query.limit)) {
      const observation = await this.fetchLatestObservation(config.seriesId, query);
      if (!observation) continue;
      macroObservations.push({
        country,
        metricCode: config.metricCode,
        metricName: config.metricName,
        observedAt: new Date(`${observation.date}T00:00:00.000Z`),
        value: Number(observation.value),
        unit: config.unit,
        frequency: config.frequency,
        source: this.displayName,
      });
    }

    return { yieldCurvePoints, macroObservations };
  }

  public async healthCheck(): Promise<MacroProviderHealth> {
    return { ok: true, checkedAt: new Date() };
  }

  private async fetchLatestObservation(
    seriesId: string,
    query: MacroIngestQuery,
  ): Promise<FredObservation | undefined> {
    const url = new URL('/fred/series/observations', this.baseUrl);
    url.searchParams.set('series_id', seriesId);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('limit', '5');
    if (query.from)
      url.searchParams.set('observation_start', query.from.toISOString().slice(0, 10));
    if (query.to) url.searchParams.set('observation_end', query.to.toISOString().slice(0, 10));

    const response = await this.fetcher(url);
    if (!response.ok)
      throw new MacroProviderError(this.id, `HTTP ${response.status} for ${seriesId}`);
    const payload = (await response.json()) as { observations?: unknown[] };
    return payload.observations?.map(parseFredObservation).find((value) => value !== undefined);
  }
}

export type MacroProviderId = 'mock' | 'fred';

export const createMacroProvider = (
  providerId: string,
  options: { readonly fredKey?: string } = {},
): MacroProvider => {
  if (providerId === 'mock') return new MockMacroProvider();
  if (providerId === 'fred') return new FredMacroProvider(options.fredKey ?? '');
  throw new MacroProviderError(providerId, 'Unsupported macro provider');
};
