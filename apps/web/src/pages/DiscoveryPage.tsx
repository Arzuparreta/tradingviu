import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  DividendEvent,
  EconomicEvent,
  EarningsEvent,
  FundamentalSnapshot,
  MacroSeriesObservation,
  NewsArticle,
  ScreenerFilter,
  ScreenerMetricDef,
  ScreenerMetricFormat,
  ScreenerQuery,
  ScreenerResult,
  YieldCurvePoint,
} from '../api/types';

type Importance = '' | 'low' | 'medium' | 'high';

const today = new Date();
const defaultFrom = new Date(today.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
const defaultTo = new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

const dateOnly = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));

const timeOnly = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );

const compact = (value: string | null): string => value ?? '—';

const metric = (value: number | undefined, mode: 'compact' | 'ratio' | 'percent' = 'ratio') => {
  if (value === undefined) return '—';
  if (mode === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (mode === 'compact') {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
};

const nullableMetric = (value: number | null, mode: 'compact' | 'ratio' | 'percent' = 'ratio') =>
  metric(value === null ? undefined : value, mode);

const tenorLabel = (months: number): string => {
  if (months < 12) return `${months}M`;
  return `${months / 12}Y`;
};

const numeric = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatScreenerMetric = (value: number | undefined, format: ScreenerMetricFormat): string => {
  if (value === undefined) return '—';
  switch (format) {
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'compact':
      return new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);
    case 'price':
    case 'ratio':
      return value.toFixed(2);
    case 'number':
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  }
};

function ScreenerRow({
  result,
  columns,
}: {
  result: ScreenerResult;
  columns: ScreenerMetricDef[];
}) {
  return (
    <tr>
      <td>
        <strong>{result.ticker}</strong>
        <div className="muted small">{result.exchange}</div>
      </td>
      <td>
        {result.name}
        <div className="muted small">{result.sector ?? result.assetClass}</div>
      </td>
      {columns.map((col) => (
        <td key={col.key} className="mono">
          {formatScreenerMetric(result.metrics[col.key], col.format)}
        </td>
      ))}
    </tr>
  );
}

function ArticleRow({ article }: { article: NewsArticle }) {
  return (
    <a className="card col discovery-link" href={article.url} target="_blank" rel="noreferrer">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="col grow" style={{ gap: 4 }}>
          <div className="row small muted" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span>{article.source}</span>
            <span>{dateOnly(article.publishedAt)}</span>
            {article.sentiment && <span className="mono">{article.sentiment}</span>}
          </div>
          <strong>{article.title}</strong>
          {article.body && <p className="muted small discovery-snippet">{article.body}</p>}
        </div>
        {article.symbols.length > 0 && (
          <div className="row" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {article.symbols.slice(0, 4).map((symbol) => (
              <span key={symbol} className="discovery-chip mono">
                {symbol}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

function EarningsRow({ event }: { event: EarningsEvent }) {
  return (
    <div className="card row discovery-event">
      <div className="mono discovery-date">{dateOnly(event.date)}</div>
      <div className="grow">
        <div>
          <strong>{event.symbol.ticker}</strong>
          <span className="muted small"> {event.symbol.exchange}</span>
        </div>
        <div className="muted small">{event.symbol.name}</div>
      </div>
      <div className="row small" style={{ gap: 14 }}>
        <span>
          EPS <span className="mono">{compact(event.epsEstimate)}</span>
        </span>
        <span>
          Rev <span className="mono">{compact(event.revenueEstimate)}</span>
        </span>
      </div>
    </div>
  );
}

function DividendRow({ event }: { event: DividendEvent }) {
  return (
    <div className="card row discovery-event">
      <div className="mono discovery-date">{dateOnly(event.exDate)}</div>
      <div className="grow">
        <div>
          <strong>{event.symbol.ticker}</strong>
          <span className="muted small"> {event.symbol.exchange}</span>
        </div>
        <div className="muted small">
          {event.symbol.name}
          {event.frequency ? ` · ${event.frequency}` : ''}
        </div>
      </div>
      <div className="row small" style={{ gap: 14 }}>
        <span>
          Div{' '}
          <span className="mono">
            {event.amount} {event.currency}
          </span>
        </span>
        {event.paymentDate && (
          <span>
            Pay <span className="mono">{dateOnly(event.paymentDate)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function EconomicRow({ event }: { event: EconomicEvent }) {
  return (
    <div className="card row discovery-event">
      <div className="mono discovery-date">
        {dateOnly(event.eventAt)}
        <div className="muted small">{timeOnly(event.eventAt)}</div>
      </div>
      <div className="grow">
        <div>
          <strong>{event.name}</strong>
          <span className="muted small"> {event.country}</span>
        </div>
        <div className="row muted small" style={{ gap: 12 }}>
          <span>Forecast {compact(event.forecast)}</span>
          <span>Previous {compact(event.previous)}</span>
          <span>Actual {compact(event.actual)}</span>
        </div>
      </div>
      <span className={`discovery-importance discovery-importance-${event.importance}`}>
        {event.importance}
      </span>
    </div>
  );
}

function FundamentalsRow({ snapshot }: { snapshot: FundamentalSnapshot }) {
  return (
    <div className="card col discovery-fundamentals-row">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div>
            <strong>{snapshot.symbol.ticker}</strong>
            <span className="muted small"> {snapshot.symbol.exchange}</span>
          </div>
          <div className="muted small">
            {snapshot.symbol.name} · {snapshot.fiscalPeriod.toUpperCase()} ·{' '}
            {dateOnly(snapshot.periodEnd)}
          </div>
        </div>
        <span className="muted small">{snapshot.source}</span>
      </div>
      <div className="discovery-metric-grid">
        <span>
          Market cap <strong>{nullableMetric(snapshot.marketCap, 'compact')}</strong>
        </span>
        <span>
          Revenue <strong>{nullableMetric(snapshot.revenue, 'compact')}</strong>
        </span>
        <span>
          P/E <strong>{nullableMetric(snapshot.peRatio)}</strong>
        </span>
        <span>
          EPS <strong>{nullableMetric(snapshot.eps)}</strong>
        </span>
        <span>
          ROE <strong>{nullableMetric(snapshot.roe, 'percent')}</strong>
        </span>
        <span>
          Revenue growth <strong>{nullableMetric(snapshot.revenueGrowth, 'percent')}</strong>
        </span>
        <span>
          52W high <strong>{nullableMetric(snapshot.week52High)}</strong>
        </span>
        <span>
          52W low <strong>{nullableMetric(snapshot.week52Low)}</strong>
        </span>
      </div>
    </div>
  );
}

function YieldCurvePanel({ points }: { points: readonly YieldCurvePoint[] }) {
  const maxRate = points.reduce((max, point) => Math.max(max, point.rate), 0);

  return (
    <div className="card col discovery-yield-curve">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <strong>{points[0]?.country ?? '—'} yield curve</strong>
          <div className="muted small">
            {points[0] ? `${dateOnly(points[0].curveDate)} · ${points[0].source}` : 'No points'}
          </div>
        </div>
        <span className="muted small">{points[0]?.currency ?? ''}</span>
      </div>
      <div className="discovery-yield-bars">
        {points.map((point) => (
          <div key={point.id} className="discovery-yield-bar">
            <div
              className="discovery-yield-fill"
              style={{ height: `${Math.max(8, (point.rate / Math.max(maxRate, 1)) * 100)}%` }}
            />
            <span className="mono small">{point.rate.toFixed(2)}%</span>
            <strong className="mono small">{tenorLabel(point.tenorMonths)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function MacroObservationRow({ observation }: { observation: MacroSeriesObservation }) {
  return (
    <div className="card row discovery-event">
      <div className="mono discovery-date">{dateOnly(observation.observedAt)}</div>
      <div className="grow">
        <div>
          <strong>{observation.metricName}</strong>
          <span className="muted small"> {observation.country}</span>
        </div>
        <div className="muted small">
          {observation.metricCode} · {observation.frequency} · {observation.source}
        </div>
      </div>
      <span className="mono">
        {observation.value.toFixed(2)}
        {observation.unit}
      </span>
    </div>
  );
}

export function DiscoveryPage() {
  const queryClient = useQueryClient();
  const [symbol, setSymbol] = useState('');
  const [country, setCountry] = useState('US');
  const [importance, setImportance] = useState<Importance>('');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [screenerText, setScreenerText] = useState('');
  const [assetClass, setAssetClass] = useState('stock');
  const [sector, setSector] = useState('');
  const [filters, setFilters] = useState<ScreenerFilter[]>([
    { key: 'marketCap', min: 1_000_000_000 },
    { key: 'peRatio', max: 40 },
  ]);
  const [columns, setColumns] = useState<string[]>([
    'marketCap',
    'peRatio',
    'dividendYield',
    'revenueGrowth',
    'roe',
    'priceToBook',
  ]);
  const [sort, setSort] = useState('marketCap');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [autoRefreshMs, setAutoRefreshMs] = useState(0);
  const [presetName, setPresetName] = useState('Large cap quality');

  const metricsQ = useQuery({
    queryKey: ['screener-metrics'],
    queryFn: () => api.screenerMetrics(),
    staleTime: Infinity,
  });
  const catalog = useMemo(() => metricsQ.data?.metrics ?? [], [metricsQ.data]);
  const catalogByKey = useMemo(() => new Map(catalog.map((m) => [m.key, m])), [catalog]);
  const catalogGroups = useMemo(() => {
    const g = new Map<string, ScreenerMetricDef[]>();
    for (const m of catalog) {
      const list = g.get(m.group);
      if (list) list.push(m);
      else g.set(m.group, [m]);
    }
    return [...g.entries()];
  }, [catalog]);
  const columnDefs = useMemo(
    () => columns.map((k) => catalogByKey.get(k)).filter((d): d is ScreenerMetricDef => !!d),
    [columns, catalogByKey],
  );

  const range = useMemo(() => ({ from, to }), [from, to]);
  const screenerParams = useMemo((): ScreenerQuery => {
    const params: ScreenerQuery = {
      assetClass,
      sort,
      direction,
      limit: 200,
      filters: filters.filter((f) => f.min !== undefined || f.max !== undefined),
    };
    if (screenerText.trim()) params.q = screenerText.trim();
    if (sector.trim()) params.sector = sector.trim();
    return params;
  }, [assetClass, sort, direction, filters, screenerText, sector]);

  const addFilter = () => {
    const used = new Set(filters.map((f) => f.key));
    const next = catalog.find((m) => !used.has(m.key))?.key ?? 'marketCap';
    setFilters((f) => [...f, { key: next }]);
  };
  const updateFilter = (
    i: number,
    patch: { key?: string; min?: number | undefined; max?: number | undefined },
  ) =>
    setFilters((f) =>
      f.map((x, j) => {
        if (j !== i) return x;
        const min = 'min' in patch ? patch.min : x.min;
        const max = 'max' in patch ? patch.max : x.max;
        const next: ScreenerFilter = { key: patch.key ?? x.key };
        if (min !== undefined) next.min = min;
        if (max !== undefined) next.max = max;
        return next;
      }),
    );
  const removeFilter = (i: number) => setFilters((f) => f.filter((_, j) => j !== i));
  const toggleColumn = (key: string) =>
    setColumns((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
  const sortByColumn = (key: string) => {
    if (sort === key) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDirection('desc');
    }
  };

  const newsQ = useQuery({
    queryKey: ['news', symbol, query, range],
    queryFn: () => api.news({ symbol, q: query, ...range, limit: 40 }),
  });
  const earningsQ = useQuery({
    queryKey: ['earnings-calendar', symbol, range],
    queryFn: () => api.earningsCalendar({ symbol, ...range, limit: 80 }),
  });
  const dividendsQ = useQuery({
    queryKey: ['dividend-calendar', symbol, range],
    queryFn: () => api.dividendCalendar({ symbol, ...range, limit: 80 }),
  });
  const economicQ = useQuery({
    queryKey: ['economic-calendar', country, importance, range],
    queryFn: () =>
      api.economicCalendar({
        country,
        ...(importance ? { importance } : {}),
        ...range,
        limit: 80,
      }),
  });
  const fundamentalsQ = useQuery({
    queryKey: ['fundamentals', symbol],
    queryFn: () => api.fundamentals({ symbol, fiscalPeriod: 'ttm', latestOnly: true, limit: 8 }),
  });
  const yieldCurvesQ = useQuery({
    queryKey: ['yield-curves', country],
    queryFn: () => api.yieldCurves({ country, latestOnly: true, limit: 16 }),
  });
  const macroSeriesQ = useQuery({
    queryKey: ['macro-series', country, range],
    queryFn: () => api.macroSeries({ country, ...range, limit: 20 }),
  });
  const screenerQ = useQuery({
    queryKey: ['screener', screenerParams],
    queryFn: () => api.screener(screenerParams),
    refetchInterval: autoRefreshMs || false,
  });
  const presetsQ = useQuery({
    queryKey: ['screener-presets', assetClass],
    queryFn: () => api.screenerPresets({ assetClass }),
  });
  const savePreset = useMutation({
    mutationFn: () =>
      api.createScreenerPreset({
        name: presetName,
        assetClass,
        query: screenerParams,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['screener-presets'] }),
  });
  const deletePreset = useMutation({
    mutationFn: (id: string) => api.deleteScreenerPreset(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['screener-presets'] }),
  });

  const applyPreset = (next: ScreenerQuery) => {
    setScreenerText(next.q ?? '');
    setAssetClass(next.assetClass ?? 'stock');
    setSector(next.sector ?? '');
    setFilters(next.filters ?? []);
    if (next.sort) setSort(next.sort);
    if (next.direction) setDirection(next.direction);
  };

  return (
    <div className="page discovery-page">
      <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1>Discovery</h1>
          <p className="muted" style={{ marginTop: -8 }}>
            Market news, earnings and macro calendar.
          </p>
        </div>
      </div>

      <section className="card discovery-filters">
        <div>
          <label>Symbol</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="BTCUSDT, AAPL..."
          />
        </div>
        <div>
          <label>News search</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="inflation, ETF..."
          />
        </div>
        <div>
          <label>Country</label>
          <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
        </div>
        <div>
          <label>Importance</label>
          <select value={importance} onChange={(e) => setImportance(e.target.value as Importance)}>
            <option value="">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </section>

      <section className="card discovery-screener">
        <div className="row discovery-section-head">
          <div>
            <h2>Screener</h2>
            <p className="muted small">
              {catalog.length} metrics across {catalogGroups.length} groups · column- and
              metadata-backed filters.
            </p>
          </div>
          <span className="grow" />
          <label className="row small" style={{ gap: 6 }}>
            <span className="muted">Auto-refresh</span>
            <select
              value={autoRefreshMs}
              onChange={(e) => setAutoRefreshMs(Number(e.target.value))}
              style={{ width: 80 }}
            >
              <option value={0}>Off</option>
              <option value={5000}>5s</option>
              <option value={15000}>15s</option>
              <option value={30000}>30s</option>
            </select>
          </label>
          <span className="muted small mono">{screenerQ.data?.results.length ?? 0}</span>
        </div>

        <div className="discovery-screener-filters">
          <div>
            <label>Search</label>
            <input
              value={screenerText}
              onChange={(e) => setScreenerText(e.target.value)}
              placeholder="AAPL, software..."
            />
          </div>
          <div>
            <label>Asset</label>
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
              <option value="stock">Stock</option>
              <option value="crypto">Crypto</option>
              <option value="index">Index</option>
              <option value="forex">Forex</option>
            </select>
          </div>
          <div>
            <label>Sector</label>
            <input value={sector} onChange={(e) => setSector(e.target.value)} />
          </div>
        </div>

        <div className="discovery-filter-builder">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <strong className="small">Metric filters</strong>
            <span className="grow" />
            <button type="button" className="ghost" onClick={addFilter} disabled={catalog.length === 0}>
              + Add filter
            </button>
          </div>
          {filters.length === 0 && (
            <div className="muted small">No metric filters — add one to narrow results.</div>
          )}
          {filters.map((f, i) => (
            <div key={i} className="row discovery-filter-row" style={{ gap: 6 }}>
              <select
                value={f.key}
                onChange={(e) => updateFilter(i, { key: e.target.value })}
                style={{ flex: 1, minWidth: 0 }}
              >
                {catalogGroups.map(([groupName, metrics]) => (
                  <optgroup key={groupName} label={groupName}>
                    {metrics.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <input
                aria-label="min"
                placeholder="min"
                value={f.min === undefined ? '' : String(f.min)}
                onChange={(e) => updateFilter(i, { min: numeric(e.target.value) })}
                style={{ width: 90 }}
              />
              <input
                aria-label="max"
                placeholder="max"
                value={f.max === undefined ? '' : String(f.max)}
                onChange={(e) => updateFilter(i, { max: numeric(e.target.value) })}
                style={{ width: 90 }}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => removeFilter(i)}
                aria-label="Remove filter"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="discovery-filter-builder">
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong className="small">Columns</strong>
            {columnDefs.map((col) => (
              <span key={col.key} className="discovery-preset-pill">
                {col.label}
                <button
                  type="button"
                  className="ghost discovery-preset-delete"
                  onClick={() => toggleColumn(col.key)}
                  aria-label={`Remove ${col.label} column`}
                >
                  ×
                </button>
              </span>
            ))}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) toggleColumn(e.target.value);
                e.target.value = '';
              }}
              style={{ width: 150 }}
            >
              <option value="">+ Add column…</option>
              {catalogGroups.map(([groupName, metrics]) => (
                <optgroup key={groupName} label={groupName}>
                  {metrics
                    .filter((m) => !columns.includes(m.key))
                    .map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className="row discovery-preset-row">
          <input
            aria-label="Preset name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button
            type="button"
            onClick={() => savePreset.mutate()}
            disabled={savePreset.isPending || !presetName.trim()}
          >
            Save preset
          </button>
          <div className="row discovery-preset-list">
            {presetsQ.data?.presets.map((preset) => (
              <span key={preset.id} className="discovery-preset-pill">
                <button type="button" className="ghost" onClick={() => applyPreset(preset.query)}>
                  {preset.name}
                </button>
                <button
                  type="button"
                  className="ghost discovery-preset-delete"
                  onClick={() => deletePreset.mutate(preset.id)}
                  disabled={deletePreset.isPending}
                  aria-label={`Delete ${preset.name}`}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        </div>

        {screenerQ.isLoading && <div className="card muted">Loading screener...</div>}
        {screenerQ.isError && <div className="card down">Could not load screener.</div>}
        {screenerQ.data?.results.length === 0 && (
          <div className="card muted">No symbols match these filters.</div>
        )}
        {(screenerQ.data?.results.length ?? 0) > 0 && (
          <div className="discovery-table-wrap">
            <table className="discovery-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  {columnDefs.map((col) => (
                    <th key={col.key}>
                      <button
                        type="button"
                        className="ghost discovery-th-sort"
                        onClick={() => sortByColumn(col.key)}
                      >
                        {col.label}
                        {sort === col.key ? (direction === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {screenerQ.data?.results.map((result) => (
                  <ScreenerRow key={result.id} result={result} columns={columnDefs} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="discovery-grid">
        <section className="col" style={{ minWidth: 0 }}>
          <div className="row">
            <h2>News</h2>
            <span className="grow" />
            <span className="muted small">{newsQ.data?.articles.length ?? 0}</span>
          </div>
          {newsQ.isLoading && <div className="card muted">Loading news...</div>}
          {newsQ.isError && <div className="card down">Could not load news.</div>}
          {newsQ.data?.articles.length === 0 && (
            <div className="card muted">No articles match these filters.</div>
          )}
          {newsQ.data?.articles.map((article) => (
            <ArticleRow key={article.id} article={article} />
          ))}
        </section>

        <section className="col" style={{ minWidth: 0 }}>
          <div className="row">
            <h2>Earnings</h2>
            <span className="grow" />
            <span className="muted small">{earningsQ.data?.events.length ?? 0}</span>
          </div>
          {earningsQ.isLoading && <div className="card muted">Loading earnings...</div>}
          {earningsQ.isError && <div className="card down">Could not load earnings.</div>}
          {earningsQ.data?.events.length === 0 && (
            <div className="card muted">No earnings match this range.</div>
          )}
          {earningsQ.data?.events.map((event) => (
            <EarningsRow key={event.id} event={event} />
          ))}

          <div className="row" style={{ marginTop: 8 }}>
            <h2>Dividends</h2>
            <span className="grow" />
            <span className="muted small">{dividendsQ.data?.events.length ?? 0}</span>
          </div>
          {dividendsQ.isLoading && <div className="card muted">Loading dividends...</div>}
          {dividendsQ.isError && <div className="card down">Could not load dividends.</div>}
          {dividendsQ.data?.events.length === 0 && (
            <div className="card muted">No dividends match this range.</div>
          )}
          {dividendsQ.data?.events.map((event) => (
            <DividendRow key={event.id} event={event} />
          ))}

          <div className="row" style={{ marginTop: 8 }}>
            <h2>Fundamentals</h2>
            <span className="grow" />
            <span className="muted small">{fundamentalsQ.data?.snapshots.length ?? 0}</span>
          </div>
          {fundamentalsQ.isLoading && <div className="card muted">Loading fundamentals...</div>}
          {fundamentalsQ.isError && <div className="card down">Could not load fundamentals.</div>}
          {fundamentalsQ.data?.snapshots.length === 0 && (
            <div className="card muted">No fundamentals match this symbol.</div>
          )}
          {fundamentalsQ.data?.snapshots.map((snapshot) => (
            <FundamentalsRow key={snapshot.id} snapshot={snapshot} />
          ))}

          <div className="row" style={{ marginTop: 8 }}>
            <h2>Rates & macro</h2>
            <span className="grow" />
            <span className="muted small">
              {(yieldCurvesQ.data?.points.length ?? 0) +
                (macroSeriesQ.data?.observations.length ?? 0)}
            </span>
          </div>
          {yieldCurvesQ.isLoading && <div className="card muted">Loading yield curve...</div>}
          {yieldCurvesQ.isError && <div className="card down">Could not load yield curve.</div>}
          {yieldCurvesQ.data?.points.length === 0 && (
            <div className="card muted">No yield curve points match this country.</div>
          )}
          {(yieldCurvesQ.data?.points.length ?? 0) > 0 && (
            <YieldCurvePanel points={yieldCurvesQ.data?.points ?? []} />
          )}
          {macroSeriesQ.isLoading && <div className="card muted">Loading macro series...</div>}
          {macroSeriesQ.isError && <div className="card down">Could not load macro series.</div>}
          {macroSeriesQ.data?.observations.length === 0 && (
            <div className="card muted">No macro observations match this range.</div>
          )}
          {macroSeriesQ.data?.observations.map((observation) => (
            <MacroObservationRow key={observation.id} observation={observation} />
          ))}

          <div className="row" style={{ marginTop: 8 }}>
            <h2>Economic</h2>
            <span className="grow" />
            <span className="muted small">{economicQ.data?.events.length ?? 0}</span>
          </div>
          {economicQ.isLoading && <div className="card muted">Loading economic events...</div>}
          {economicQ.isError && <div className="card down">Could not load economic events.</div>}
          {economicQ.data?.events.length === 0 && (
            <div className="card muted">No economic events match this range.</div>
          )}
          {economicQ.data?.events.map((event) => (
            <EconomicRow key={event.id} event={event} />
          ))}
        </section>
      </div>
    </div>
  );
}
