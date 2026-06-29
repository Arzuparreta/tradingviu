import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Star, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import { Card, EmptyState, PageHeader } from '../ui';

export function WatchlistsPage() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const listsQ = useQuery({ queryKey: ['watchlists'], queryFn: () => api.watchlists() });
  const lists = listsQ.data?.watchlists ?? [];
  const activeId = picked ?? lists[0]?.id ?? null;
  const activeList = lists.find((l) => l.id === activeId) ?? null;

  const create = useMutation({
    mutationFn: (name: string) => api.createWatchlist(name),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['watchlists'] });
      setPicked(r.id);
      setNewName('');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteWatchlist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlists'] });
      setPicked(null);
    },
  });

  const itemsQ = useQuery({
    queryKey: ['watchlist-items', activeId],
    queryFn: () => api.watchlistItems(activeId!),
    enabled: !!activeId,
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.removeFromWatchlist(activeId!, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist-items', activeId] }),
  });

  const items = itemsQ.data?.items ?? [];

  return (
    <div className="page ui-page">
      <PageHeader title="Watchlists" subtitle="Symbols you track" />
      <div className="wl-grid">
        <Card title="Lists" icon={<Star size={13} />} flush>
          <div className="wl-create">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New watchlist…"
              onKeyDown={(e) => e.key === 'Enter' && newName && create.mutate(newName)}
            />
            <button
              className="primary sm"
              disabled={!newName || create.isPending}
              onClick={() => newName && create.mutate(newName)}
              aria-label="Create watchlist"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="wl-lists">
            {listsQ.isLoading && <p className="muted small wl-pad">Loading…</p>}
            {!listsQ.isLoading && lists.length === 0 && (
              <p className="muted small wl-pad">No watchlists yet.</p>
            )}
            {lists.map((l) => (
              <button
                key={l.id}
                className={`wl-list-row${l.id === activeId ? ' active' : ''}`}
                onClick={() => setPicked(l.id)}
              >
                <span className="grow ellipsis">{l.name}</span>
                <span
                  className="wl-del"
                  role="button"
                  tabIndex={0}
                  title="Delete list"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${l.name}"?`)) remove.mutate(l.id);
                  }}
                >
                  <Trash2 size={13} />
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card title={activeList?.name ?? 'Symbols'} flush>
          {!activeId ? (
            <EmptyState icon={<Star size={20} />} title="No watchlist selected" hint="Create or pick a list." />
          ) : itemsQ.isLoading ? (
            <p className="muted small wl-pad">Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Star size={20} />}
              title="No symbols yet"
              hint="Add symbols from any chart’s watchlist button."
            />
          ) : (
            <div className="tbl-wrap" style={{ border: 0 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Note</th>
                    <th className="num" aria-label="actions" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/chart/${item.symbol.id}`} className="mono">
                          {item.symbol.exchange}:{item.symbol.ticker}
                        </Link>
                      </td>
                      <td className="muted ellipsis">{item.symbol.name}</td>
                      <td className="muted ellipsis">{item.note ?? ''}</td>
                      <td className="num">
                        <button
                          className="sm danger"
                          onClick={() => removeItem.mutate(item.id)}
                          title="Remove from list"
                          aria-label="Remove from list"
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
