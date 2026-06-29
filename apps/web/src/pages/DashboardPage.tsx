import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CalendarDays,
  CandlestickChart,
  Compass,
  LogOut,
  Newspaper,
  Star,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';
import type { Bar, Quote, ScreenerResult, WatchlistItem } from '../api/types';
import { quoteKey, useMarketQuotes, type QuoteSymbol } from '../hooks/use-market-quotes';
import type { MarketStatus } from '../hooks/use-market-stream';

const pct = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dayFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const asIsoDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const formatCap = (value: number | undefined): string =>
  value == null
    ? '-'
    : new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="dashboard-empty">{children}</div>;
}

function LiveDot({ status }: { status: MarketStatus }) {
  if (status === 'idle') return null;
  const cls = status === 'live' ? 'live' : status === 'down' ? 'down' : 'connecting';
  const label = status === 'live' ? 'Live' : status === 'down' ? 'Offline' : 'Connecting…';
  return <span className={`live-dot ${cls}`} title={label} aria-label={label} />;
}

function Panel({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-head">
        <div className="row">
          {icon}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Sparkline({ bars }: { bars: readonly Bar[] }) {
  const closes = bars.slice(-48).map((b) => b.close);
  if (closes.length < 2) return <div className="dashboard-sparkline muted">No data</div>;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const points = closes
    .map((v, i) => {
      const x = (i / (closes.length - 1)) * 100;
      const y = 28 - ((v - min) / span) * 24;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const up = closes[closes.length - 1]! >= closes[0]!;

  return (
    <svg className="dashboard-sparkline" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="2" />
    </svg>
  );
}

function WatchlistRow({ item, quote }: { item: WatchlistItem; quote?: Quote | undefined }) {
  const historyQ = useQuery({
    queryKey: ['dashboard-history', item.symbol.id],
    queryFn: () => api.history(item.symbol.id, '1d', 80),
    staleTime: 30_000,
  });
  const bars = historyQ.data?.bars ?? [];
  const first = bars[0]?.close;
  const lastClose = bars[bars.length - 1]?.close;
  const mid = quote ? (quote.bid + quote.ask) / 2 : undefined;
  const price = mid ?? lastClose;
  const change = first && price ? (price - first) / first : null;

  // Brief flash when the live price ticks up or down.
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prev = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (mid == null) return;
    const before = prev.current;
    prev.current = mid;
    if (before != null && mid !== before) {
      setFlash(mid > before ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 450);
      return () => clearTimeout(t);
    }
    return;
  }, [mid]);

  return (
    <Link className="dashboard-watch-row" to={`/chart/${item.symbol.ticker}`}>
      <div>
        <strong>{item.symbol.ticker}</strong>
        <span>{item.symbol.exchange}</span>
      </div>
      <Sparkline bars={bars} />
      <div className="dashboard-watch-price">
        <strong className={`price-flash${flash ? ` ${flash}` : ''}`}>
          {price != null ? compact.format(price) : historyQ.isLoading ? '...' : '-'}
        </strong>
        {change != null && <span className={change >= 0 ? 'up' : 'down'}>{pct.format(change)}</span>}
      </div>
    </Link>
  );
}

function AssetBoardRow({ result }: { result: ScreenerResult }) {
  const marketCap = result.metrics.marketCap;
  const growth = result.metrics.revenueGrowth;

  return (
    <Link className="dashboard-list-row dashboard-asset-row" to={`/chart/${result.ticker}`}>
      <strong>
        {result.ticker}
        <span>{result.exchange}</span>
      </strong>
      <span>
        {result.assetClass}
        {' · '}
        {formatCap(marketCap)}
        {growth != null ? ` · ${pct.format(growth)}` : ''}
      </span>
    </Link>
  );
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const watchlistsQ = useQuery({ queryKey: ['watchlists'], queryFn: () => api.watchlists() });
  const selectedWatchlist = watchlistsQ.data?.watchlists[0] ?? null;
  const watchlistItemsQ = useQuery({
    queryKey: ['watchlist-items', selectedWatchlist?.id],
    queryFn: () => api.watchlistItems(selectedWatchlist!.id),
    enabled: !!selectedWatchlist,
  });
  const alertsQ = useQuery({ queryKey: ['alerts'], queryFn: () => api.alerts() });
  const newsQ = useQuery({ queryKey: ['dashboard-news'], queryFn: () => api.news({ limit: 5 }) });
  const assetBoardQ = useQuery({
    queryKey: ['dashboard-assets'],
    queryFn: () =>
      api.screener({
        active: true,
        sort: 'marketCap',
        direction: 'desc',
        limit: 6,
      }),
  });
  const earningsQ = useQuery({
    queryKey: ['dashboard-earnings'],
    queryFn: () => api.earningsCalendar({ from: asIsoDate(0), to: asIsoDate(21), limit: 5 }),
  });
  const dividendsQ = useQuery({
    queryKey: ['dashboard-dividends'],
    queryFn: () => api.dividendCalendar({ from: asIsoDate(0), to: asIsoDate(21), limit: 5 }),
  });
  const economicQ = useQuery({
    queryKey: ['dashboard-economic'],
    queryFn: () => api.economicCalendar({ from: asIsoDate(0), to: asIsoDate(14), limit: 5 }),
  });

  const activeAlerts = useMemo(
    () => (alertsQ.data?.alerts ?? []).filter((a) => a.active).slice(0, 6),
    [alertsQ.data?.alerts],
  );

  const events = useMemo(() => {
    const earnings =
      earningsQ.data?.events.map((e) => ({
        key: `earnings-${e.id}`,
        at: e.date,
        label: `${e.symbol.ticker} earnings`,
        meta: e.epsEstimate ? `EPS est ${e.epsEstimate}` : e.symbol.exchange,
      })) ?? [];
    const dividends =
      dividendsQ.data?.events.map((e) => ({
        key: `dividend-${e.id}`,
        at: e.exDate,
        label: `${e.symbol.ticker} ex-dividend`,
        meta: `${e.amount} ${e.currency}`,
      })) ?? [];
    const macro =
      economicQ.data?.events.map((e) => ({
        key: `economic-${e.id}`,
        at: e.eventAt,
        label: e.name,
        meta: `${e.country} ${e.importance}`,
      })) ?? [];
    return [...earnings, ...dividends, ...macro]
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .slice(0, 8);
  }, [dividendsQ.data?.events, earningsQ.data?.events, economicQ.data?.events]);

  const watchItems = (watchlistItemsQ.data?.items ?? []).slice(0, 6);
  const assetBoard = assetBoardQ.data?.results ?? [];

  const quoteSymbols: QuoteSymbol[] = watchItems.map((i) => ({
    id: i.symbol.id,
    exchange: i.symbol.exchange,
    ticker: i.symbol.ticker,
  }));
  const { status: liveStatus, quotes } = useMarketQuotes(quoteSymbols);

  return (
    <div className="page dashboard-page">
      <div className="dashboard-top">
        <div>
          <h1>{user?.displayName ? `${user.displayName}'s market desk` : 'Market desk'}</h1>
          <p className="muted">Charts, watchlists, alerts, catalysts and news</p>
        </div>
        <div className="row">
          <Link to="/chart/BTCUSDT" className="dashboard-action">
            <CandlestickChart size={16} />
            Open chart
          </Link>
          <button onClick={logout} className="ghost dashboard-icon-action" title="Sign out" aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <Panel
          icon={<Star size={16} />}
          title={selectedWatchlist?.name ?? 'Watchlist'}
          action={
            <span className="row" style={{ gap: 8 }}>
              <LiveDot status={liveStatus} />
              <Link to="/watchlists">Manage</Link>
            </span>
          }
        >
          {watchItems.length > 0 ? (
            <div className="dashboard-watchlist">
              {watchItems.map((item) => (
                <WatchlistRow key={item.id} item={item} quote={quotes[quoteKey(item.symbol)]} />
              ))}
            </div>
          ) : (
            <Empty>{watchlistItemsQ.isLoading || watchlistsQ.isLoading ? 'Loading watchlist...' : 'No symbols in your watchlist yet.'}</Empty>
          )}
        </Panel>

        <Panel icon={<Compass size={16} />} title="Asset board" action={<Link to="/discovery">Discovery</Link>}>
          {assetBoard.length > 0 ? (
            <div className="dashboard-list">
              {assetBoard.map((result) => (
                <AssetBoardRow key={result.id} result={result} />
              ))}
            </div>
          ) : (
            <Empty>{assetBoardQ.isLoading ? 'Loading assets...' : 'No tracked assets available.'}</Empty>
          )}
        </Panel>

        <Panel icon={<Bell size={16} />} title="Active alerts" action={<Link to="/alerts">Review</Link>}>
          {activeAlerts.length > 0 ? (
            <div className="dashboard-list">
              {activeAlerts.map((a) => (
                <Link key={a.id} to="/alerts" className="dashboard-list-row">
                  <strong>{a.name}</strong>
                  <span>{a.symbol.ticker}</span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty>{alertsQ.isLoading ? 'Loading alerts...' : 'No active alerts.'}</Empty>
          )}
        </Panel>

        <Panel icon={<CalendarDays size={16} />} title="Upcoming events" action={<Link to="/discovery">Discovery</Link>}>
          {events.length > 0 ? (
            <div className="dashboard-list">
              {events.map((e) => (
                <div key={e.key} className="dashboard-list-row">
                  <strong>{e.label}</strong>
                  <span>
                    {e.at.includes('T') ? dateFmt.format(new Date(e.at)) : dayFmt.format(new Date(`${e.at}T00:00:00`))}
                    {' · '}
                    {e.meta}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>{earningsQ.isLoading || dividendsQ.isLoading || economicQ.isLoading ? 'Loading events...' : 'No upcoming events.'}</Empty>
          )}
        </Panel>

        <Panel icon={<Newspaper size={16} />} title="Market news" action={<Link to="/discovery">More</Link>}>
          {(newsQ.data?.articles ?? []).length > 0 ? (
            <div className="dashboard-news-list">
              {newsQ.data!.articles.map((n) => (
                <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="dashboard-news-row">
                  <strong>{n.title}</strong>
                  <span>
                    {n.source} · {dateFmt.format(new Date(n.publishedAt))}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <Empty>{newsQ.isLoading ? 'Loading news...' : 'No news available.'}</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
