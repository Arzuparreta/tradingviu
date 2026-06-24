import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  DividendEvent,
  EconomicEvent,
  EarningsEvent,
  FundamentalSnapshot,
  NewsArticle,
  ScreenerQuery,
  ScreenerResult,
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

const numeric = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function ScreenerRow({ result }: { result: ScreenerResult }) {
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
      <td className="mono">{metric(result.metrics.marketCap, 'compact')}</td>
      <td className="mono">{metric(result.metrics.peRatio)}</td>
      <td className="mono">{metric(result.metrics.dividendYield, 'percent')}</td>
      <td className="mono">{metric(result.metrics.revenueGrowth, 'percent')}</td>
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
  const [marketCapMin, setMarketCapMin] = useState('1000000000');
  const [peRatioMax, setPeRatioMax] = useState('40');
  const [dividendYieldMin, setDividendYieldMin] = useState('');
  const [presetName, setPresetName] = useState('Large cap quality');

  const range = useMemo(() => ({ from, to }), [from, to]);
  const screenerParams = useMemo((): ScreenerQuery => {
    const params: ScreenerQuery = {
      assetClass,
      sort: 'marketCap',
      direction: 'desc',
      limit: 50,
    };
    if (screenerText.trim()) params.q = screenerText.trim();
    if (sector.trim()) params.sector = sector.trim();
    const parsedMarketCapMin = numeric(marketCapMin);
    const parsedPeRatioMax = numeric(peRatioMax);
    const parsedDividendYieldMin = numeric(dividendYieldMin);
    if (parsedMarketCapMin !== undefined) params.marketCapMin = parsedMarketCapMin;
    if (parsedPeRatioMax !== undefined) params.peRatioMax = parsedPeRatioMax;
    if (parsedDividendYieldMin !== undefined) params.dividendYieldMin = parsedDividendYieldMin;
    return params;
  }, [assetClass, dividendYieldMin, marketCapMin, peRatioMax, screenerText, sector]);

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
  const screenerQ = useQuery({
    queryKey: ['screener', screenerParams],
    queryFn: () => api.screener(screenerParams),
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
    setMarketCapMin(next.marketCapMin === undefined ? '' : String(next.marketCapMin));
    setPeRatioMax(next.peRatioMax === undefined ? '' : String(next.peRatioMax));
    setDividendYieldMin(next.dividendYieldMin === undefined ? '' : String(next.dividendYieldMin));
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
              Symbols filtered by reference fields and metadata metrics.
            </p>
          </div>
          <span className="grow" />
          <span className="muted small">{screenerQ.data?.results.length ?? 0}</span>
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
          <div>
            <label>Min market cap</label>
            <input value={marketCapMin} onChange={(e) => setMarketCapMin(e.target.value)} />
          </div>
          <div>
            <label>Max P/E</label>
            <input value={peRatioMax} onChange={(e) => setPeRatioMax(e.target.value)} />
          </div>
          <div>
            <label>Min dividend yield</label>
            <input
              value={dividendYieldMin}
              onChange={(e) => setDividendYieldMin(e.target.value)}
              placeholder="0.01"
            />
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
                  <th>Market cap</th>
                  <th>P/E</th>
                  <th>Yield</th>
                  <th>Rev growth</th>
                </tr>
              </thead>
              <tbody>
                {screenerQ.data?.results.map((result) => (
                  <ScreenerRow key={result.id} result={result} />
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
