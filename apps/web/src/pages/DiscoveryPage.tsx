import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { IconBarChart, IconBolt, IconCalendar, IconLandmark, IconNews, IconSearch } from '../ui/icons';
import { api } from '../api/client';
import {
  Badge,
  DataList,
  DataRow,
  DataTable,
  EmptyState,
  Panel,
  Segmented,
  TitleBar,
  type BadgeTone,
} from '../ui';
import type {
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

const compact = (value: number | undefined): string =>
  value == null
    ? '–'
    : new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
        value,
      );

const ratio = (value: number | undefined): string =>
  value == null ? '–' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

const percent = (value: number | undefined): string =>
  value == null ? '–' : `${(value * 100).toFixed(1)}%`;

const textOrDash = (value: string | null): string => value ?? '–';

const horizonRange = (horizon: Horizon) => {
  const now = new Date();
  const from = new Date(now.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + Number(horizon) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
};

const sentimentTone = (sentiment: string | null): BadgeTone => {
  const n = sentiment?.toLowerCase();
  if (n === 'positive' || n === 'bullish') return 'up';
  if (n === 'negative' || n === 'bearish') return 'down';
  return 'neutral';
};

const importanceTone = (importance: string): BadgeTone => {
  if (importance === 'high') return 'down';
  if (importance === 'medium') return 'warn';
  return 'neutral';
};

function AssetRow({ result }: { result: ScreenerResult }) {
  const { marketCap, revenueGrowth, peRatio } = result.metrics;
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

function YieldCurve({ points }: { points: readonly YieldCurvePoint[] }) {
  const max = points.reduce((m, point) => Math.max(m, point.rate), 0);
  if (points.length === 0) {
    return <EmptyState icon={<IconLandmark size={18} />} title="No yield curve data" />;
  }
  return (
    <div className="disc-yield">
      {points.map((point) => (
        <div key={point.id} className="disc-yield-point">
          <div className="disc-yield-track">
            <span style={{ height: `${Math.max(8, (point.rate / Math.max(max, 1)) * 100)}%` }} />
          </div>
          <strong>{point.rate.toFixed(2)}%</strong>
          <span>
            {point.tenorMonths < 12 ? `${point.tenorMonths}M` : `${point.tenorMonths / 12}Y`}
          </span>
        </div>
      ))}
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
      api.earningsCalendar({ ...range, limit: 12, ...(focusSymbol ? { symbol: focusSymbol } : {}) }),
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
  const noCatalysts = events.length + earnings.length === 0;

  return (
    <div className="disc">
      <TitleBar
        title="Discovery"
        actions={<Segmented value={horizon} onChange={setHorizon} options={HORIZON_OPTIONS} />}
      />

      <div className="disc-controls">
        <div className="disc-search">
          <IconSearch size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search news or assets"
          />
        </div>
        <input
          className="disc-inp"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Symbol"
        />
        <input
          className="disc-inp"
          value={country}
          onChange={(e) => setCountry(e.target.value.toUpperCase())}
          placeholder="Country"
        />
        <Segmented value={assetClass} onChange={setAssetClass} options={ASSET_OPTIONS} />
      </div>

      <div className="disc-cols">
        <div className="disc-col">
          <Panel title="Headlines" icon={<IconNews size={15} />} flush>
            {articles.length > 0 ? (
              <div className="disc-scroll">
                <DataList>
                  {articles.map((a) => (
                    <DataRow
                      key={a.id}
                      href={a.url}
                      title={a.title}
                      sub={`${a.source} · ${dateOnly(a.publishedAt)}`}
                      value={
                        a.sentiment != null ? (
                          <Badge tone={sentimentTone(a.sentiment)}>{a.sentiment}</Badge>
                        ) : undefined
                      }
                    />
                  ))}
                </DataList>
              </div>
            ) : (
              <EmptyState
                icon={<IconNews size={18} />}
                title={newsQ.isLoading ? 'Loading news' : 'No indexed news'}
              />
            )}
          </Panel>

          <Panel title="Asset board" icon={<IconBarChart size={15} />} flush>
            {assets.length > 0 ? (
              <div className="disc-scroll">
                <DataTable>
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
                </DataTable>
              </div>
            ) : (
              <EmptyState icon={<IconBarChart size={18} />} title="No tracked assets" />
            )}
          </Panel>

          <Panel title="Fundamentals" icon={<IconBolt size={15} />} flush>
            {fundamentals.length > 0 ? (
              <DataTable>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th className="num">Market cap</th>
                    <th className="num">P/E</th>
                    <th className="num">Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {fundamentals.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/chart/${s.symbol.ticker}`}>
                          <strong>{s.symbol.ticker}</strong>
                        </Link>
                        <div className="muted small">{s.symbol.name}</div>
                      </td>
                      <td className="num">{compact(s.marketCap ?? undefined)}</td>
                      <td className="num">{ratio(s.peRatio ?? undefined)}</td>
                      <td
                        className={`num ${
                          s.revenueGrowth != null && s.revenueGrowth >= 0 ? 'up' : 'down'
                        }`}
                      >
                        {percent(s.revenueGrowth ?? undefined)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <EmptyState
                icon={<IconBolt size={18} />}
                title={fundamentalsQ.isLoading ? 'Loading fundamentals' : 'No fundamental snapshots'}
              />
            )}
          </Panel>
        </div>

        <div className="disc-col">
          <Panel title="Macro pulse" icon={<IconLandmark size={15} />} flush>
            <YieldCurve points={yieldCurveQ.data?.points ?? []} />
            {macro.length > 0 ? (
              <DataList>
                {macro.map((o) => (
                  <DataRow
                    key={o.id}
                    title={o.metricName}
                    sub={o.metricCode}
                    value={`${o.value.toFixed(2)}${o.unit}`}
                  />
                ))}
              </DataList>
            ) : (
              <EmptyState
                icon={<IconLandmark size={18} />}
                title={macroQ.isLoading ? 'Loading macro' : 'No macro observations'}
              />
            )}
          </Panel>

          <Panel title="Catalysts" icon={<IconCalendar size={15} />} flush>
            {noCatalysts ? (
              <EmptyState
                icon={<IconCalendar size={18} />}
                title={
                  economicQ.isLoading || earningsQ.isLoading
                    ? 'Loading catalysts'
                    : 'No high-impact catalysts'
                }
              />
            ) : (
              <div className="disc-scroll">
                <DataList>
                  {events.map((e) => (
                    <DataRow
                      key={e.id}
                      title={e.name}
                      sub={`${e.country} · act ${textOrDash(e.actual)} · fc ${textOrDash(e.forecast)}`}
                      value={<Badge tone={importanceTone(e.importance)}>{e.importance}</Badge>}
                    />
                  ))}
                  {earnings.map((e) => (
                    <DataRow
                      key={e.id}
                      title={`${e.symbol.ticker} earnings`}
                      sub={`${dateOnly(e.date)} · ${e.symbol.name}`}
                      value={`EPS ${textOrDash(e.epsEstimate)}`}
                    />
                  ))}
                </DataList>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
