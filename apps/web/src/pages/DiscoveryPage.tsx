import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarClock, Landmark, Newspaper, Search, Zap } from 'lucide-react';
import { api } from '../api/client';
import { Badge, EmptyState, PageHeader, Segmented, type BadgeTone } from '../ui';
import type {
  EconomicEvent,
  EarningsEvent,
  FundamentalSnapshot,
  MacroSeriesObservation,
  NewsArticle,
  ScreenerQuery,
  ScreenerResult,
  YieldCurvePoint,
} from '../api/types';

type AssetClass = 'stock' | 'crypto' | 'index' | 'forex';
type Horizon = '7' | '14' | '30';

const ASSET_OPTIONS: readonly { value: AssetClass; label: string }[] = [
  { value: 'stock', label: 'Equities' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'index', label: 'Indices' },
  { value: 'forex', label: 'FX' },
];

const HORIZON_OPTIONS: readonly { value: Horizon; label: string }[] = [
  { value: '7', label: '7D' },
  { value: '14', label: '14D' },
  { value: '30', label: '30D' },
];

const dateOnly = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));

const timeOnly = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );

const compact = (value: number | undefined): string =>
  value == null
    ? '-'
    : new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);

const ratio = (value: number | undefined): string =>
  value == null ? '-' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

const percent = (value: number | undefined): string =>
  value == null ? '-' : `${(value * 100).toFixed(1)}%`;

const textOrDash = (value: string | null): string => value ?? '-';

const horizonRange = (horizon: Horizon) => {
  const now = new Date();
  const from = new Date(now.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + Number(horizon) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
};

const badgeToneForSentiment = (sentiment: string | null): BadgeTone => {
  const normalized = sentiment?.toLowerCase();
  if (normalized === 'positive' || normalized === 'bullish') return 'up';
  if (normalized === 'negative' || normalized === 'bearish') return 'down';
  return 'neutral';
};

const badgeToneForImportance = (importance: string): BadgeTone => {
  if (importance === 'high') return 'down';
  if (importance === 'medium') return 'warn';
  return 'neutral';
};

function Panel({
  icon,
  title,
  meta,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`discovery-panel${className ? ` ${className}` : ''}`}>
      <div className="discovery-panel-head">
        <div className="row">
          {icon}
          <h2>{title}</h2>
        </div>
        {meta != null && <span className="discovery-panel-meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function ArticleRow({ article }: { article: NewsArticle }) {
  return (
    <a className="discovery-news-row" href={article.url} target="_blank" rel="noreferrer">
      <div className="discovery-news-main">
        <div className="discovery-news-meta">
          <span>{article.source}</span>
          <span>{dateOnly(article.publishedAt)}</span>
          {article.sentiment != null && (
            <Badge tone={badgeToneForSentiment(article.sentiment)}>{article.sentiment}</Badge>
          )}
        </div>
        <strong>{article.title}</strong>
        {article.body != null && <p>{article.body}</p>}
      </div>
      {article.symbols.length > 0 && (
        <div className="discovery-symbol-strip">
          {article.symbols.slice(0, 4).map((symbol) => (
            <span key={symbol}>{symbol}</span>
          ))}
        </div>
      )}
    </a>
  );
}

function AssetRow({ result }: { result: ScreenerResult }) {
  const marketCap = result.metrics.marketCap;
  const revenueGrowth = result.metrics.revenueGrowth;
  const peRatio = result.metrics.peRatio;

  return (
    <tr>
      <td>
        <Link to={`/chart/${result.ticker}`}>
          <strong>{result.ticker}</strong>
        </Link>
        <div className="muted small">{result.exchange}</div>
      </td>
      <td>
        {result.name}
        <div className="muted small">{result.sector ?? result.assetClass}</div>
      </td>
      <td className="num">{compact(marketCap)}</td>
      <td className="num">{ratio(peRatio)}</td>
      <td className={`num ${revenueGrowth != null && revenueGrowth >= 0 ? 'up' : 'down'}`}>
        {percent(revenueGrowth)}
      </td>
    </tr>
  );
}

function EconomicRow({ event }: { event: EconomicEvent }) {
  return (
    <div className="discovery-event-row">
      <div className="discovery-event-date">
        <strong>{dateOnly(event.eventAt)}</strong>
        <span>{timeOnly(event.eventAt)}</span>
      </div>
      <div className="grow">
        <div className="row discovery-event-title">
          <strong>{event.name}</strong>
          <Badge tone={badgeToneForImportance(event.importance)}>{event.importance}</Badge>
        </div>
        <div className="muted small">
          {event.country} · Actual {textOrDash(event.actual)} · Forecast {textOrDash(event.forecast)}
        </div>
      </div>
    </div>
  );
}

function EarningsRow({ event }: { event: EarningsEvent }) {
  return (
    <div className="discovery-event-row">
      <div className="discovery-event-date">
        <strong>{dateOnly(event.date)}</strong>
      </div>
      <div className="grow">
        <strong>{event.symbol.ticker} earnings</strong>
        <div className="muted small">
          {event.symbol.name} · EPS est {textOrDash(event.epsEstimate)} · Rev est{' '}
          {textOrDash(event.revenueEstimate)}
        </div>
      </div>
    </div>
  );
}

function YieldCurve({ points }: { points: readonly YieldCurvePoint[] }) {
  const max = points.reduce((m, point) => Math.max(m, point.rate), 0);
  if (points.length === 0) {
    return <EmptyState icon={<Landmark size={18} />} title="No yield curve data" />;
  }

  return (
    <div className="discovery-yield">
      {points.map((point) => (
        <div key={point.id} className="discovery-yield-point">
          <div className="discovery-yield-track">
            <span style={{ height: `${Math.max(8, (point.rate / Math.max(max, 1)) * 100)}%` }} />
          </div>
          <strong>{point.rate.toFixed(2)}%</strong>
          <span>{point.tenorMonths < 12 ? `${point.tenorMonths}M` : `${point.tenorMonths / 12}Y`}</span>
        </div>
      ))}
    </div>
  );
}

function MacroRow({ observation }: { observation: MacroSeriesObservation }) {
  return (
    <div className="discovery-macro-row">
      <div>
        <strong>{observation.metricName}</strong>
        <span>{observation.metricCode}</span>
      </div>
      <div className="num">
        {observation.value.toFixed(2)}
        {observation.unit}
      </div>
    </div>
  );
}

function FundamentalRow({ snapshot }: { snapshot: FundamentalSnapshot }) {
  return (
    <div className="discovery-fund-row">
      <div>
        <strong>{snapshot.symbol.ticker}</strong>
        <span>{snapshot.symbol.name}</span>
      </div>
      <div className="discovery-fund-metrics">
        <span>Cap {compact(snapshot.marketCap ?? undefined)}</span>
        <span>P/E {ratio(snapshot.peRatio ?? undefined)}</span>
        <span>Growth {percent(snapshot.revenueGrowth ?? undefined)}</span>
      </div>
    </div>
  );
}

export function DiscoveryPage() {
  const [assetClass, setAssetClass] = useState<AssetClass>('stock');
  const [horizon, setHorizon] = useState<Horizon>('14');
  const [country, setCountry] = useState('US');
  const [symbol, setSymbol] = useState('');
  const [query, setQuery] = useState('');

  const range = useMemo(() => horizonRange(horizon), [horizon]);
  const focusSymbol = symbol.trim();
  const searchText = query.trim();

  const assetParams = useMemo((): ScreenerQuery => {
    const params: ScreenerQuery = {
      assetClass,
      active: true,
      limit: 24,
      sort: assetClass === 'stock' ? 'marketCap' : 'ticker',
      direction: assetClass === 'stock' ? 'desc' : 'asc',
    };
    if (searchText) params.q = searchText;
    return params;
  }, [assetClass, searchText]);

  const newsQ = useQuery({
    queryKey: ['discovery-news', focusSymbol, searchText, range],
    queryFn: () =>
      api.news({
        ...range,
        limit: 30,
        ...(focusSymbol ? { symbol: focusSymbol } : {}),
        ...(searchText ? { q: searchText } : {}),
      }),
  });
  const assetsQ = useQuery({
    queryKey: ['discovery-assets', assetParams],
    queryFn: () => api.screener(assetParams),
  });
  const economicQ = useQuery({
    queryKey: ['discovery-economic', country, range],
    queryFn: () => api.economicCalendar({ country, importance: 'high', ...range, limit: 10 }),
  });
  const earningsQ = useQuery({
    queryKey: ['discovery-earnings', focusSymbol, range],
    queryFn: () =>
      api.earningsCalendar({
        ...range,
        limit: 12,
        ...(focusSymbol ? { symbol: focusSymbol } : {}),
      }),
  });
  const yieldCurveQ = useQuery({
    queryKey: ['discovery-yield-curve', country],
    queryFn: () => api.yieldCurves({ country, latestOnly: true, limit: 16 }),
  });
  const macroQ = useQuery({
    queryKey: ['discovery-macro', country],
    queryFn: () => api.macroSeries({ country, limit: 8 }),
  });
  const fundamentalsQ = useQuery({
    queryKey: ['discovery-fundamentals', focusSymbol],
    queryFn: () =>
      api.fundamentals({
        fiscalPeriod: 'ttm',
        latestOnly: true,
        limit: 6,
        ...(focusSymbol ? { symbol: focusSymbol } : {}),
      }),
  });

  const articles = newsQ.data?.articles ?? [];
  const assets = assetsQ.data?.results ?? [];
  const events = economicQ.data?.events ?? [];
  const earnings = earningsQ.data?.events ?? [];
  const macro = macroQ.data?.observations ?? [];
  const fundamentals = fundamentalsQ.data?.snapshots ?? [];

  return (
    <div className="page discovery-page">
      <PageHeader
        title="Discovery"
        subtitle="Market news, macro, catalysts and tracked assets"
        actions={<Segmented value={horizon} onChange={setHorizon} options={HORIZON_OPTIONS} />}
      />

      <section className="discovery-controlbar" aria-label="Discovery filters">
        <div className="discovery-searchbox">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search news or assets"
          />
        </div>
        <input
          className="discovery-symbol-input"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          placeholder="Symbol"
        />
        <input
          className="discovery-country-input"
          value={country}
          onChange={(event) => setCountry(event.target.value.toUpperCase())}
          placeholder="Country"
        />
        <Segmented value={assetClass} onChange={setAssetClass} options={ASSET_OPTIONS} />
      </section>

      <div className="discovery-layout">
        <Panel
          icon={<Newspaper size={15} />}
          title="Headlines"
          meta={newsQ.isLoading ? 'Loading' : `${articles.length}`}
          className="discovery-headlines"
        >
          {articles.length > 0 ? (
            <div className="discovery-news-list">
              {articles.map((article) => (
                <ArticleRow key={article.id} article={article} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Newspaper size={18} />}
              title={newsQ.isLoading ? 'Loading news' : 'No indexed news'}
              hint={newsQ.isError ? 'News API failed.' : undefined}
            />
          )}
        </Panel>

        <div className="discovery-side">
          <Panel icon={<Landmark size={15} />} title="Macro pulse" meta={country}>
            <YieldCurve points={yieldCurveQ.data?.points ?? []} />
            <div className="discovery-macro-list">
              {macro.length > 0 ? (
                macro.map((observation) => (
                  <MacroRow key={observation.id} observation={observation} />
                ))
              ) : (
                <EmptyState
                  icon={<Landmark size={18} />}
                  title={macroQ.isLoading ? 'Loading macro' : 'No macro observations'}
                />
              )}
            </div>
          </Panel>

          <Panel
            icon={<CalendarClock size={15} />}
            title="Catalysts"
            meta={`${events.length + earnings.length}`}
          >
            <div className="discovery-event-list">
              {events.map((event) => (
                <EconomicRow key={event.id} event={event} />
              ))}
              {earnings.map((event) => (
                <EarningsRow key={event.id} event={event} />
              ))}
              {events.length + earnings.length === 0 && (
                <EmptyState
                  icon={<CalendarClock size={18} />}
                  title={
                    economicQ.isLoading || earningsQ.isLoading
                      ? 'Loading catalysts'
                      : 'No high-impact catalysts'
                  }
                />
              )}
            </div>
          </Panel>
        </div>

        <Panel
          icon={<BarChart3 size={15} />}
          title="Asset board"
          meta={assetsQ.isLoading ? 'Loading' : `${assets.length}`}
          className="discovery-assets"
        >
          {assets.length > 0 ? (
            <div className="tbl-wrap discovery-asset-table">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th className="num">Market cap</th>
                    <th className="num">P/E</th>
                    <th className="num">Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((result) => (
                    <AssetRow key={result.id} result={result} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<BarChart3 size={18} />} title="No tracked assets" />
          )}
        </Panel>

        <Panel
          icon={<Zap size={15} />}
          title="Fundamental snapshots"
          meta={fundamentalsQ.isLoading ? 'Loading' : `${fundamentals.length}`}
          className="discovery-fundamentals"
        >
          {fundamentals.length > 0 ? (
            <div className="discovery-fund-list">
              {fundamentals.map((snapshot) => (
                <FundamentalRow key={snapshot.id} snapshot={snapshot} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Zap size={18} />}
              title={fundamentalsQ.isLoading ? 'Loading fundamentals' : 'No fundamental snapshots'}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
