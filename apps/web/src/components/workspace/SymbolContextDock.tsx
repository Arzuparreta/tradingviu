import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { IconIndicator } from '../../ui/icons';
import { api } from '../../api/client';
import { Badge, DataList, DataRow, Dock } from '../../ui';

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function SymbolContextDock({
  symbolId,
  ticker,
}: {
  symbolId: string | null;
  ticker: string | null;
}) {
  const [open, setOpen] = useState(true);

  const newsQ = useQuery({
    queryKey: ['ctx-news', ticker],
    queryFn: () => api.news({ symbol: ticker!, limit: 6 }),
    enabled: open && !!ticker,
    staleTime: 60_000,
  });
  const alertsQ = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.alerts(),
    enabled: open,
  });

  const articles = newsQ.data?.articles ?? [];
  const alerts = (alertsQ.data?.alerts ?? []).filter((a) => a.symbolId === symbolId);

  return (
    <Dock
      title={ticker ? `${ticker} context` : 'Context'}
      icon={<IconIndicator size={14} />}
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      {!ticker && <div className="ui-dock-empty">No symbol selected</div>}

      {ticker && (
        <>
          <div className="ui-dock-section">Alerts</div>
          {alerts.length > 0 ? (
            <DataList>
              {alerts.map((a) => (
                <DataRow
                  key={a.id}
                  to="/alerts"
                  title={a.name}
                  sub={a.active ? 'active' : 'paused'}
                  value={<Badge tone={a.active ? 'accent' : 'neutral'}>{a.kind}</Badge>}
                />
              ))}
            </DataList>
          ) : (
            <div className="ui-dock-empty">
              No alerts · <Link to="/alerts">create</Link>
            </div>
          )}

          <div className="ui-dock-section">News</div>
          {articles.length > 0 ? (
            <DataList>
              {articles.map((n) => (
                <DataRow
                  key={n.id}
                  href={n.url}
                  title={n.title}
                  sub={`${n.source} · ${dateFmt.format(new Date(n.publishedAt))}`}
                />
              ))}
            </DataList>
          ) : (
            <div className="ui-dock-empty">{newsQ.isLoading ? 'Loading…' : 'No recent news'}</div>
          )}
        </>
      )}
    </Dock>
  );
}
