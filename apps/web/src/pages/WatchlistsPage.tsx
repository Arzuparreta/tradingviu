import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';

export function WatchlistsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listsQ = useQuery({
    queryKey: ['watchlists'],
    queryFn: () => api.watchlists(),
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: (name: string) => api.createWatchlist(name),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['watchlists'] });
      setSelectedId(r.id);
      setNewName('');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteWatchlist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlists'] });
      setSelectedId(null);
    },
  });

  const itemsQ = useQuery({
    queryKey: ['watchlist-items', selectedId],
    queryFn: () => api.watchlistItems(selectedId!),
    enabled: !!selectedId,
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.removeFromWatchlist(selectedId!, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist-items', selectedId] }),
  });

  if (!user) return <div className="page"><Link to="/login">Log in</Link></div>;

  return (
    <div className="page">
      <h1>Watchlists</h1>
      <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
        <div className="col" style={{ minWidth: 240 }}>
          <div className="row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New watchlist name"
              style={{ flex: 1 }}
            />
            <button
              className="primary"
              disabled={!newName || create.isPending}
              onClick={() => newName && create.mutate(newName)}
            >
              Create
            </button>
          </div>
          {listsQ.isLoading && <p className="muted">Loading…</p>}
          {listsQ.data && (
            <div className="col" style={{ gap: 4, marginTop: 12 }}>
              {listsQ.data.watchlists.length === 0 && (
                <p className="muted small">No watchlists yet</p>
              )}
              {listsQ.data.watchlists.map((l) => (
                <div
                  key={l.id}
                  className="row"
                  style={{
                    padding: 8,
                    background: selectedId === l.id ? 'var(--bg-3)' : 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedId(l.id)}
                >
                  <span style={{ flex: 1 }}>{l.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${l.name}"?`)) remove.mutate(l.id); }}
                    style={{ padding: '2px 8px', fontSize: 11 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="col" style={{ flex: 1 }}>
          {!selectedId && <p className="muted">Select a watchlist to view symbols.</p>}
          {selectedId && itemsQ.isLoading && <p className="muted">Loading…</p>}
          {itemsQ.data && (
            <div className="col" style={{ gap: 4 }}>
              <p className="muted small">{itemsQ.data.items.length} symbol(s)</p>
              {itemsQ.data.items.length === 0 && (
                <p className="muted">Empty. Add symbols from a chart page.</p>
              )}
              {itemsQ.data.items.map((item) => (
                <div key={item.id} className="row card" style={{ padding: 8 }}>
                  <Link to={`/chart/${item.symbol.id}`} className="mono">
                    {item.symbol.exchange}:{item.symbol.ticker}
                  </Link>
                  <span className="muted small">{item.symbol.name}</span>
                  {item.note && <span className="muted small">— {item.note}</span>}
                  <span className="grow" />
                  <button
                    onClick={() => removeItem.mutate(item.id)}
                    style={{ padding: '2px 8px', fontSize: 11 }}
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
