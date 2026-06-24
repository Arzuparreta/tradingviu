import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';
import type { ScriptRow, ScriptVisibility, ScriptsSort } from '../api/types';

const visibilities: ScriptVisibility[] = ['public', 'protected', 'private'];
const visibilityClass: Record<ScriptVisibility, string> = {
  public: 'up',
  protected: 'muted',
  private: 'down',
};

type FeedFilter = 'all' | 'mine' | 'free';

const formatPrice = (cents: number): string =>
  cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2)}`;

function ScriptCard({ script, userId }: { script: ScriptRow; userId: string | undefined }) {
  const queryClient = useQueryClient();
  const [source, setSource] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const isOwner = userId === script.author.id;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['scripts'] });

  const toggleFavorite = useMutation({
    mutationFn: () =>
      script.favorited ? api.unfavoriteScript(script.id) : api.favoriteScript(script.id),
    onSuccess: refresh,
  });

  const install = useMutation({
    mutationFn: () => api.installScript(script.id),
    onSuccess: (res) => {
      setSource(res.source);
      setLocked(res.locked);
      refresh();
    },
  });

  const remove = useMutation({ mutationFn: () => api.deleteScript(script.id), onSuccess: refresh });

  return (
    <div className="card">
      <div className="row">
        <div>
          <div style={{ fontWeight: 600 }}>
            {script.name}
            <span className={`small ${visibilityClass[script.visibility]}`} style={{ marginLeft: 8 }}>
              · {script.visibility}
            </span>
          </div>
          <div className="muted small mono">
            {formatPrice(script.priceCents)} · {script.license} ·{' '}
            {script.author.displayName ?? script.author.email} ·{' '}
            {new Date(script.createdAt).toLocaleDateString()}
          </div>
          {script.description && (
            <p className="small" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
              {script.description}
            </p>
          )}
        </div>
        <span className="grow" />
        <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
          <div className="row" style={{ gap: 8 }}>
            <button
              className={script.favorited ? 'primary' : ''}
              onClick={() => toggleFavorite.mutate()}
              disabled={toggleFavorite.isPending}
            >
              ★ {script.favoritesCount}
            </button>
            <button onClick={() => install.mutate()} disabled={install.isPending}>
              ⬇ {script.downloads}
            </button>
          </div>
          {isOwner && (
            <button onClick={() => remove.mutate()} disabled={remove.isPending}>
              Delete
            </button>
          )}
        </div>
      </div>

      {install.isSuccess && (
        <div style={{ marginTop: 10 }}>
          {source ? (
            <pre
              className="small mono"
              style={{
                background: 'var(--surface-2, #11151c)',
                padding: 10,
                borderRadius: 6,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {source}
            </pre>
          ) : (
            <p className="muted small">
              {locked
                ? 'Installed. This is a closed-source script — the source stays hidden.'
                : 'Installed.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ScriptsPage() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [src, setSrc] = useState('');
  const [visibility, setVisibility] = useState<ScriptVisibility>('public');
  const [price, setPrice] = useState('0');
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [sort, setSort] = useState<ScriptsSort>('recent');

  const scriptsQ = useQuery({
    queryKey: ['scripts', filter, sort],
    queryFn: () =>
      api.scripts({
        sort,
        ...(filter === 'mine' ? { author: 'me' } : {}),
        ...(filter === 'free' ? { free: true } : {}),
      }),
  });

  const publish = useMutation({
    mutationFn: () =>
      api.publishScript({
        name: name.trim(),
        source: src.trim(),
        visibility,
        priceCents: Math.round(Number(price) * 100) || 0,
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    onSuccess: () => {
      setName('');
      setDescription('');
      setSrc('');
      setPrice('0');
      queryClient.invalidateQueries({ queryKey: ['scripts'] });
    },
  });

  return (
    <div className="page">
      <h1>Scripts</h1>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <section className="card" style={{ width: 360 }}>
          <div className="col">
            <div>
              <label>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="SuperTrend Pro"
                maxLength={160}
              />
            </div>
            <div>
              <label>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does it do? (optional)"
                rows={3}
              />
            </div>
            <div>
              <label>Source</label>
              <textarea
                value={src}
                onChange={(e) => setSrc(e.target.value)}
                placeholder="//@version=5&#10;indicator('My Script')"
                rows={6}
                style={{ fontFamily: 'monospace' }}
              />
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Visibility</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as ScriptVisibility)}
                >
                  {visibilities.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Price (USD)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
            <button
              className="primary"
              disabled={name.trim().length === 0 || src.trim().length === 0 || publish.isPending}
              onClick={() => publish.mutate()}
            >
              Publish script
            </button>
            {publish.isError && (
              <p className="down small">{(publish.error as Error).message}</p>
            )}
          </div>
        </section>

        <section style={{ flex: 1 }}>
          <div className="row" style={{ marginBottom: 12, gap: 8 }}>
            <button className={filter === 'all' ? 'primary' : ''} onClick={() => setFilter('all')}>
              All
            </button>
            <button className={filter === 'mine' ? 'primary' : ''} onClick={() => setFilter('mine')}>
              Mine
            </button>
            <button className={filter === 'free' ? 'primary' : ''} onClick={() => setFilter('free')}>
              Free
            </button>
            <span className="grow" />
            <button className={sort === 'recent' ? 'primary' : ''} onClick={() => setSort('recent')}>
              Newest
            </button>
            <button
              className={sort === 'popular' ? 'primary' : ''}
              onClick={() => setSort('popular')}
            >
              Popular
            </button>
          </div>
          {scriptsQ.isLoading && <p className="muted">Loading…</p>}
          <div className="col">
            {scriptsQ.data?.scripts.map((s) => (
              <ScriptCard key={s.id} script={s} userId={user?.id} />
            ))}
            {scriptsQ.data?.scripts.length === 0 && <p className="muted">No scripts yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
