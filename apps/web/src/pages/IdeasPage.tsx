import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';
import type { IdeaDirection } from '../api/types';

const directions: IdeaDirection[] = ['long', 'short', 'neutral'];
const directionClass: Record<IdeaDirection, string> = {
  long: 'up',
  short: 'down',
  neutral: 'muted',
};

type FeedFilter = 'all' | 'mine';

export function IdeasPage() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [symbol, setSymbol] = useState('');
  const [direction, setDirection] = useState<IdeaDirection>('long');
  const [isPrivate, setIsPrivate] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>('all');

  const ideasQ = useQuery({
    queryKey: ['ideas', filter],
    queryFn: () => api.ideas(filter === 'mine' ? { author: 'me' } : {}),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createIdea({
        title: title.trim(),
        direction,
        visibility: isPrivate ? 'private' : 'public',
        ...(body.trim() ? { body: body.trim() } : {}),
        ...(symbol.trim() ? { symbol: symbol.trim() } : {}),
      }),
    onSuccess: () => {
      setTitle('');
      setBody('');
      setSymbol('');
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteIdea(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ideas'] }),
  });

  return (
    <div className="page">
      <h1>Ideas</h1>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <section className="card" style={{ width: 340 }}>
          <div className="col">
            <div>
              <label>Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="AAPL breakout into earnings"
                maxLength={160}
              />
            </div>
            <div>
              <label>Thesis</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Why this trade? (optional)"
                rows={4}
              />
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Symbol</label>
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="AAPL (optional)"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>Direction</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as IdeaDirection)}
                >
                  {directions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <span className="small">Private (only you can see it)</span>
            </label>
            <button
              className="primary"
              disabled={title.trim().length === 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              Publish idea
            </button>
            {create.isError && (
              <p className="down small">{(create.error as Error).message}</p>
            )}
          </div>
        </section>

        <section style={{ flex: 1 }}>
          <div className="row" style={{ marginBottom: 12, gap: 8 }}>
            <button className={filter === 'all' ? 'primary' : ''} onClick={() => setFilter('all')}>
              All ideas
            </button>
            <button className={filter === 'mine' ? 'primary' : ''} onClick={() => setFilter('mine')}>
              My ideas
            </button>
          </div>
          {ideasQ.isLoading && <p className="muted">Loading…</p>}
          <div className="col">
            {ideasQ.data?.ideas.map((idea) => (
              <div key={idea.id} className="card">
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {idea.title}
                      {idea.visibility === 'private' && (
                        <span className="muted small" style={{ marginLeft: 8 }}>
                          · private
                        </span>
                      )}
                    </div>
                    <div className="muted small mono">
                      {idea.symbol ? `${idea.symbol.exchange}:${idea.symbol.ticker} · ` : ''}
                      {idea.direction && (
                        <span className={directionClass[idea.direction]}>{idea.direction}</span>
                      )}
                      {idea.direction ? ' · ' : ''}
                      {idea.author.displayName ?? idea.author.email} ·{' '}
                      {new Date(idea.createdAt).toLocaleDateString()}
                    </div>
                    {idea.body && (
                      <p className="small" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                        {idea.body}
                      </p>
                    )}
                  </div>
                  <span className="grow" />
                  <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
                    <span className="muted small">
                      ♥ {idea.likesCount} · 💬 {idea.commentsCount}
                    </span>
                    {user?.id === idea.author.id && (
                      <button onClick={() => remove.mutate(idea.id)} disabled={remove.isPending}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {ideasQ.data?.ideas.length === 0 && <p className="muted">No ideas yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
