import {
  FundamentalProviderSnapshotSchema,
  FundamentalsIngestQuerySchema,
  NormalizedFundamentalSnapshotSchema,
  type FundamentalProviderSnapshot,
  type FundamentalsIngestQuery,
  type NormalizedFundamentalSnapshot,
} from '@tv/core';

export interface FundamentalsProviderHealth {
  readonly ok: boolean;
  readonly checkedAt: Date;
  readonly message?: string;
}

export interface FundamentalsProvider {
  readonly id: string;
  readonly displayName: string;
  fetchFundamentals(
    query: FundamentalsIngestQuery,
  ): Promise<readonly FundamentalProviderSnapshot[]>;
  healthCheck(): Promise<FundamentalsProviderHealth>;
}

export class FundamentalsProviderError extends Error {
  public override readonly name = 'FundamentalsProviderError';
  public override readonly cause?: unknown;
  public readonly provider: string;

  public constructor(provider: string, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.provider = provider;
    if (cause !== undefined) this.cause = cause;
  }
}

const normalizeSymbol = (symbol: string): string => symbol.trim().toUpperCase();

const uniqueSymbols = (symbols: readonly string[]): string[] => {
  const seen = new Set<string>();
  for (const symbol of symbols) {
    const normalized = normalizeSymbol(symbol);
    if (normalized.length > 0) seen.add(normalized);
  }
  return [...seen].sort();
};

export const normalizeFundamentalSnapshot = (
  provider: Pick<FundamentalsProvider, 'id' | 'displayName'>,
  snapshot: unknown,
  fetchedAt: Date,
): NormalizedFundamentalSnapshot => {
  const parsed = FundamentalProviderSnapshotSchema.parse(snapshot);
  return NormalizedFundamentalSnapshotSchema.parse({
    ...parsed,
    symbol: normalizeSymbol(parsed.symbol),
    source: parsed.source ?? provider.displayName,
    fetchedAt,
  });
};

export const fetchNormalizedFundamentals = async (
  provider: FundamentalsProvider,
  queryInput: unknown,
  fetchedAt = new Date(),
): Promise<readonly NormalizedFundamentalSnapshot[]> => {
  const query = FundamentalsIngestQuerySchema.parse(queryInput);
  const rawSnapshots = await provider.fetchFundamentals(query);
  return rawSnapshots.map((snapshot) =>
    normalizeFundamentalSnapshot(provider, snapshot, fetchedAt),
  );
};

const mockSnapshots: readonly FundamentalProviderSnapshot[] = [
  {
    symbol: 'AAPL',
    fiscalPeriod: 'ttm',
    periodEnd: new Date('2026-06-30T00:00:00.000Z'),
    source: 'Tradingviu Fundamental Mock',
    currency: 'USD',
    isLatest: true,
    marketCap: 3_280_000_000_000,
    peRatio: 31.8,
    eps: 6.51,
    revenue: 394_000_000_000,
    dividendYield: 0.0047,
    roe: 1.49,
    revenueGrowth: 0.064,
    earningsGrowth: 0.076,
    beta: 1.17,
    week52High: 239.4,
    week52Low: 165.2,
  },
  {
    symbol: 'MSFT',
    fiscalPeriod: 'ttm',
    periodEnd: new Date('2026-06-30T00:00:00.000Z'),
    source: 'Tradingviu Fundamental Mock',
    currency: 'USD',
    isLatest: true,
    marketCap: 3_570_000_000_000,
    peRatio: 36.1,
    eps: 13.42,
    revenue: 284_000_000_000,
    dividendYield: 0.0064,
    roe: 0.37,
    revenueGrowth: 0.154,
    earningsGrowth: 0.174,
    beta: 0.91,
    week52High: 471.2,
    week52Low: 346.1,
  },
];

export class MockFundamentalsProvider implements FundamentalsProvider {
  public readonly id = 'mock';
  public readonly displayName = 'Tradingviu Fundamental Mock';
  private readonly snapshots: readonly FundamentalProviderSnapshot[];

  public constructor(snapshots: readonly FundamentalProviderSnapshot[] = mockSnapshots) {
    this.snapshots = snapshots.map((snapshot) => FundamentalProviderSnapshotSchema.parse(snapshot));
  }

  public async fetchFundamentals(
    queryInput: FundamentalsIngestQuery,
  ): Promise<readonly FundamentalProviderSnapshot[]> {
    const query = FundamentalsIngestQuerySchema.parse(queryInput);
    const wanted = new Set(uniqueSymbols(query.symbols));
    return this.snapshots
      .filter((snapshot) => (wanted.size > 0 ? wanted.has(normalizeSymbol(snapshot.symbol)) : true))
      .filter((snapshot) => snapshot.fiscalPeriod === query.fiscalPeriod)
      .slice(0, query.limit);
  }

  public async healthCheck(): Promise<FundamentalsProviderHealth> {
    return { ok: true, checkedAt: new Date('2026-06-24T00:00:00.000Z') };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordValue = (record: Record<string, unknown>, path: readonly string[]): unknown => {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
};

const numberAt = (
  record: Record<string, unknown>,
  paths: readonly (readonly string[])[],
): number | undefined => {
  for (const path of paths) {
    const value = recordValue(record, path);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
};

const stringAt = (
  record: Record<string, unknown>,
  paths: readonly (readonly string[])[],
): string | undefined => {
  for (const path of paths) {
    const value = recordValue(record, path);
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
};

const firstResult = (payload: unknown): Record<string, unknown> => {
  if (!isRecord(payload)) throw new FundamentalsProviderError('polygon', 'Invalid JSON response');
  const results = payload.results;
  if (!Array.isArray(results) || results.length === 0 || !isRecord(results[0])) {
    throw new FundamentalsProviderError('polygon', 'No fundamentals returned');
  }
  return results[0];
};

export class PolygonFundamentalsProvider implements FundamentalsProvider {
  public readonly id = 'polygon';
  public readonly displayName = 'Polygon Financials';

  public constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.polygon.io',
  ) {
    if (!apiKey.trim()) throw new FundamentalsProviderError(this.id, 'POLYGON_KEY is required');
  }

  public async fetchFundamentals(
    queryInput: FundamentalsIngestQuery,
  ): Promise<readonly FundamentalProviderSnapshot[]> {
    const query = FundamentalsIngestQuerySchema.parse(queryInput);
    const symbols = uniqueSymbols(query.symbols).slice(0, query.limit);
    if (symbols.length === 0) {
      throw new FundamentalsProviderError(this.id, 'FUNDAMENTALS_INGEST_SYMBOLS is required');
    }

    const snapshots: FundamentalProviderSnapshot[] = [];
    for (const symbol of symbols) {
      snapshots.push(await this.fetchOne(symbol, query.fiscalPeriod));
    }
    return snapshots;
  }

  public async healthCheck(): Promise<FundamentalsProviderHealth> {
    return { ok: true, checkedAt: new Date() };
  }

  private async fetchOne(
    symbol: string,
    fiscalPeriod: string,
  ): Promise<FundamentalProviderSnapshot> {
    const url = new URL('/stocks/financials/v1/ratios', this.baseUrl);
    url.searchParams.set('ticker', symbol);
    url.searchParams.set('limit', '1');
    url.searchParams.set('apiKey', this.apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      throw new FundamentalsProviderError(this.id, `HTTP ${response.status} for ${symbol}`);
    }

    const result = firstResult(await response.json());
    const periodEnd =
      stringAt(result, [
        ['period_end_date'],
        ['end_date'],
        ['fiscal_period_end_date'],
        ['filing_date'],
      ]) ?? new Date().toISOString();

    return FundamentalProviderSnapshotSchema.parse({
      symbol,
      fiscalPeriod,
      periodEnd,
      source: this.displayName,
      currency: stringAt(result, [['currency'], ['financials', 'currency']]) ?? 'USD',
      isLatest: true,
      marketCap: numberAt(result, [['market_cap'], ['marketCapitalization']]),
      peRatio: numberAt(result, [
        ['price_to_earnings_ratio'],
        ['pe_ratio'],
        ['valuation', 'price_to_earnings_ratio'],
      ]),
      eps: numberAt(result, [
        ['earnings_per_share'],
        ['eps'],
        ['income_statement', 'earnings_per_share_basic'],
      ]),
      revenue: numberAt(result, [
        ['revenues'],
        ['revenue'],
        ['income_statement', 'revenues', 'value'],
      ]),
      dividendYield: numberAt(result, [['dividend_yield'], ['dividendYield']]),
      roe: numberAt(result, [['return_on_equity'], ['roe']]),
      revenueGrowth: numberAt(result, [['revenue_growth'], ['revenueGrowth']]),
      earningsGrowth: numberAt(result, [['earnings_growth'], ['earningsGrowth']]),
      beta: numberAt(result, [['beta']]),
      week52High: numberAt(result, [['week_52_high'], ['52_week_high']]),
      week52Low: numberAt(result, [['week_52_low'], ['52_week_low']]),
    });
  }
}

export type FundamentalsProviderId = 'mock' | 'polygon';

export const createFundamentalsProvider = (
  providerId: string,
  options: { readonly polygonKey?: string } = {},
): FundamentalsProvider => {
  if (providerId === 'mock') return new MockFundamentalsProvider();
  if (providerId === 'polygon') return new PolygonFundamentalsProvider(options.polygonKey ?? '');
  throw new FundamentalsProviderError(providerId, 'Unsupported fundamentals provider');
};
