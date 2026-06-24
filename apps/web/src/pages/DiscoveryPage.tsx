import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { EconomicEvent, EarningsEvent, NewsArticle } from '../api/types';

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

export function DiscoveryPage() {
  const [symbol, setSymbol] = useState('');
  const [country, setCountry] = useState('US');
  const [importance, setImportance] = useState<Importance>('');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const range = useMemo(() => ({ from, to }), [from, to]);
  const newsQ = useQuery({
    queryKey: ['news', symbol, query, range],
    queryFn: () => api.news({ symbol, q: query, ...range, limit: 40 }),
  });
  const earningsQ = useQuery({
    queryKey: ['earnings-calendar', symbol, range],
    queryFn: () => api.earningsCalendar({ symbol, ...range, limit: 80 }),
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
