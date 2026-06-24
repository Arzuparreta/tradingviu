import {
  CalendarIngestQuerySchema,
  DividendProviderEventSchema,
  EarningsProviderEventSchema,
  EconomicProviderEventSchema,
  NormalizedDividendEventSchema,
  NormalizedEarningsEventSchema,
  NormalizedEconomicEventSchema,
  type CalendarIngestQuery,
  type DividendProviderEvent,
  type EarningsProviderEvent,
  type EconomicImportance,
  type EconomicProviderEvent,
  type NormalizedDividendEvent,
  type NormalizedEarningsEvent,
  type NormalizedEconomicEvent,
} from '@tv/core';

export interface CalendarProviderHealth {
  readonly ok: boolean;
  readonly checkedAt: Date;
  readonly message?: string;
}

export interface CalendarProviderResult {
  readonly earnings: readonly EarningsProviderEvent[];
  readonly dividends: readonly DividendProviderEvent[];
  readonly economic: readonly EconomicProviderEvent[];
}

export interface CalendarProvider {
  readonly id: string;
  readonly displayName: string;
  fetchCalendar(query: CalendarIngestQuery): Promise<CalendarProviderResult>;
  healthCheck(): Promise<CalendarProviderHealth>;
}

export class CalendarProviderError extends Error {
  public override readonly name = 'CalendarProviderError';
  public override readonly cause?: unknown;
  public readonly provider: string;

  public constructor(provider: string, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.provider = provider;
    if (cause !== undefined) this.cause = cause;
  }
}

export const normalizeEarningsEvent = (
  event: unknown,
  fetchedAt: Date,
): NormalizedEarningsEvent => {
  const parsed = EarningsProviderEventSchema.parse(event);
  return NormalizedEarningsEventSchema.parse({
    ...parsed,
    symbol: parsed.symbol.toUpperCase(),
    fetchedAt,
  });
};

export const normalizeDividendEvent = (
  event: unknown,
  fetchedAt: Date,
): NormalizedDividendEvent => {
  const parsed = DividendProviderEventSchema.parse(event);
  return NormalizedDividendEventSchema.parse({
    ...parsed,
    symbol: parsed.symbol.toUpperCase(),
    fetchedAt,
  });
};

export const normalizeEconomicEvent = (
  event: unknown,
  fetchedAt: Date,
): NormalizedEconomicEvent => {
  const parsed = EconomicProviderEventSchema.parse(event);
  return NormalizedEconomicEventSchema.parse({
    ...parsed,
    country: parsed.country.toUpperCase(),
    fetchedAt,
  });
};

export const fetchNormalizedCalendar = async (
  provider: CalendarProvider,
  queryInput: unknown,
  fetchedAt = new Date(),
): Promise<{
  readonly earnings: readonly NormalizedEarningsEvent[];
  readonly dividends: readonly NormalizedDividendEvent[];
  readonly economic: readonly NormalizedEconomicEvent[];
}> => {
  const query = CalendarIngestQuerySchema.parse(queryInput);
  const raw = await provider.fetchCalendar(query);
  return {
    earnings: raw.earnings.map((event) => normalizeEarningsEvent(event, fetchedAt)),
    dividends: raw.dividends.map((event) => normalizeDividendEvent(event, fetchedAt)),
    economic: raw.economic.map((event) => normalizeEconomicEvent(event, fetchedAt)),
  };
};

export class MockCalendarProvider implements CalendarProvider {
  public readonly id = 'mock';
  public readonly displayName = 'Tradingviu Calendar Mock';

  public async fetchCalendar(queryInput: CalendarIngestQuery): Promise<CalendarProviderResult> {
    const query = CalendarIngestQuerySchema.parse(queryInput);
    const wanted = new Set(query.symbols.map((symbol) => symbol.toUpperCase()));
    const keep = (symbol: string): boolean => wanted.size === 0 || wanted.has(symbol.toUpperCase());
    const country = query.country ? query.country.toUpperCase() : 'US';

    const earnings: readonly EarningsProviderEvent[] = [
      {
        symbol: 'AAPL',
        date: new Date('2026-07-02T20:00:00.000Z'),
        epsEstimate: '1.42',
        revenueEstimate: '89.3B',
      },
      {
        symbol: 'MSFT',
        date: new Date('2026-07-09T20:00:00.000Z'),
        epsEstimate: '3.21',
        revenueEstimate: '69.8B',
      },
    ].filter((event) => keep(event.symbol));

    const dividends: readonly DividendProviderEvent[] = [
      {
        symbol: 'AAPL',
        exDate: new Date('2026-08-11T04:00:00.000Z'),
        paymentDate: new Date('2026-08-18T04:00:00.000Z'),
        recordDate: new Date('2026-08-12T04:00:00.000Z'),
        declarationDate: new Date('2026-07-31T20:00:00.000Z'),
        amount: '0.26',
        currency: 'USD',
        frequency: 'quarterly',
      },
      {
        symbol: 'MSFT',
        exDate: new Date('2026-08-20T04:00:00.000Z'),
        paymentDate: new Date('2026-09-10T04:00:00.000Z'),
        recordDate: new Date('2026-08-21T04:00:00.000Z'),
        declarationDate: new Date('2026-06-17T20:00:00.000Z'),
        amount: '0.83',
        currency: 'USD',
        frequency: 'quarterly',
      },
    ].filter((event) => keep(event.symbol));

    const economic: readonly EconomicProviderEvent[] = [
      {
        country,
        eventAt: new Date('2026-06-26T12:30:00.000Z'),
        name: 'Core PCE Price Index',
        importance: 'high',
        forecast: '0.2%',
        previous: '0.2%',
      },
      {
        country,
        eventAt: new Date('2026-07-02T12:30:00.000Z'),
        name: 'Nonfarm Payrolls',
        importance: 'high',
        forecast: '180K',
        previous: '139K',
      },
    ];

    return {
      earnings: earnings.slice(0, query.limit),
      dividends: dividends.slice(0, query.limit),
      economic: economic.slice(0, query.limit),
    };
  }

  public async healthCheck(): Promise<CalendarProviderHealth> {
    return { ok: true, checkedAt: new Date('2026-06-24T00:00:00.000Z') };
  }
}

type Fetcher = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const toText = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return undefined;
};

const toDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

const importanceFromImpact = (impact: unknown): EconomicImportance => {
  const value = typeof impact === 'string' ? impact.toLowerCase() : '';
  if (value === 'high') return 'high';
  if (value === 'medium') return 'medium';
  return 'low';
};

const parseFmpEarnings = (value: unknown): EarningsProviderEvent | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  const date = toDate(record.date);
  if (typeof record.symbol !== 'string' || !date) return undefined;
  return {
    symbol: record.symbol,
    date,
    epsEstimate: toText(record.epsEstimated),
    epsActual: toText(record.eps),
    revenueEstimate: toText(record.revenueEstimated),
    revenueActual: toText(record.revenue),
  };
};

const parseFmpDividend = (value: unknown): DividendProviderEvent | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  const exDate = toDate(record.date);
  const amount = toText(record.adjDividend) ?? toText(record.dividend);
  if (typeof record.symbol !== 'string' || !exDate || amount === undefined) return undefined;
  return {
    symbol: record.symbol,
    exDate,
    paymentDate: toDate(record.paymentDate),
    recordDate: toDate(record.recordDate),
    declarationDate: toDate(record.declarationDate),
    amount,
    currency: 'USD',
    frequency: toText(record.frequency),
  };
};

const parseFmpEconomic = (value: unknown): EconomicProviderEvent | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  const eventAt = toDate(record.date);
  if (typeof record.event !== 'string' || typeof record.country !== 'string' || !eventAt) {
    return undefined;
  }
  return {
    country: record.country,
    eventAt,
    name: record.event,
    importance: importanceFromImpact(record.impact),
    actual: toText(record.actual),
    forecast: toText(record.estimate),
    previous: toText(record.previous),
  };
};

export class FmpCalendarProvider implements CalendarProvider {
  public readonly id = 'fmp';
  public readonly displayName = 'Financial Modeling Prep';

  public constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://financialmodelingprep.com',
    private readonly fetcher: Fetcher = fetch,
  ) {
    if (!apiKey.trim()) throw new CalendarProviderError(this.id, 'FMP_KEY is required');
  }

  public async fetchCalendar(queryInput: CalendarIngestQuery): Promise<CalendarProviderResult> {
    const query = CalendarIngestQuerySchema.parse(queryInput);
    const from = query.from ?? new Date();
    const to = query.to ?? new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
    const wanted = new Set(query.symbols.map((symbol) => symbol.toUpperCase()));
    const keepSymbol = (symbol: string): boolean =>
      wanted.size === 0 || wanted.has(symbol.toUpperCase());
    const keepCountry = (country: string): boolean =>
      !query.country || country.toUpperCase() === query.country.toUpperCase();

    const earnings = (await this.fetchJson('/api/v3/earning_calendar', from, to))
      .map(parseFmpEarnings)
      .filter((event): event is EarningsProviderEvent => event !== undefined && keepSymbol(event.symbol))
      .slice(0, query.limit);

    const dividends = (await this.fetchJson('/api/v3/stock_dividend_calendar', from, to))
      .map(parseFmpDividend)
      .filter((event): event is DividendProviderEvent => event !== undefined && keepSymbol(event.symbol))
      .slice(0, query.limit);

    const economic = (await this.fetchJson('/api/v3/economic_calendar', from, to))
      .map(parseFmpEconomic)
      .filter((event): event is EconomicProviderEvent => event !== undefined && keepCountry(event.country))
      .slice(0, query.limit);

    return { earnings, dividends, economic };
  }

  public async healthCheck(): Promise<CalendarProviderHealth> {
    return { ok: true, checkedAt: new Date() };
  }

  private async fetchJson(path: string, from: Date, to: Date): Promise<unknown[]> {
    const url = new URL(path, this.baseUrl);
    url.searchParams.set('from', toDateString(from));
    url.searchParams.set('to', toDateString(to));
    url.searchParams.set('apikey', this.apiKey);

    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new CalendarProviderError(this.id, `HTTP ${response.status} for ${path}`);
    }
    const payload = (await response.json()) as unknown;
    return Array.isArray(payload) ? payload : [];
  }
}

export type CalendarProviderId = 'mock' | 'fmp';

export const createCalendarProvider = (
  providerId: string,
  options: { readonly fmpKey?: string } = {},
): CalendarProvider => {
  if (providerId === 'mock') return new MockCalendarProvider();
  if (providerId === 'fmp') return new FmpCalendarProvider(options.fmpKey ?? '');
  throw new CalendarProviderError(providerId, 'Unsupported calendar provider');
};
