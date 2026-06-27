import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';

export function ApiKeysPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [writeScope, setWriteScope] = useState(false);
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const publicWsUrl = `${window.location.origin.replace(/^http/, 'ws')}/v1/ws?api_key=tvk_…`;

  const tokensQ = useQuery({
    queryKey: ['access-tokens'],
    queryFn: () => api.accessTokens(),
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createAccessToken({
        name: name.trim(),
        scopes: writeScope ? ['read', 'write'] : ['read'],
      }),
    onSuccess: (r) => {
      setCreated({ name: name.trim(), key: r.key });
      setName('');
      setWriteScope(false);
      queryClient.invalidateQueries({ queryKey: ['access-tokens'] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeAccessToken(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['access-tokens'] }),
  });

  if (!user) {
    return (
      <div className="page">
        <p>
          You need to <Link to="/login">log in</Link> to manage API keys.
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>API keys</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Personal access tokens for the public API. See the{' '}
        <a href="/openapi.json" target="_blank" rel="noreferrer">
          OpenAPI spec
        </a>
        .
      </p>

      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <section className="card" style={{ width: 340 }}>
          <div className="col">
            <div>
              <label>Key name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My script"
              />
            </div>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked disabled />
              Read
            </label>
            <label className="row small" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={writeScope}
                onChange={(e) => setWriteScope(e.target.checked)}
              />
              Write
            </label>
            <button
              className="primary"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              Create key
            </button>
            {created && (
              <div className="card" style={{ background: 'var(--bg-3)' }}>
                <div className="small up">Copy this key now — it won't be shown again.</div>
                <code
                  className="mono small"
                  style={{ wordBreak: 'break-all', display: 'block', marginTop: 6 }}
                >
                  {created.key}
                </code>
                <button
                  className="ghost small"
                  style={{ marginTop: 6 }}
                  onClick={() => navigator.clipboard?.writeText(created.key)}
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        </section>

        <section style={{ flex: 1, minWidth: 0 }}>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="small muted">Example requests</div>
            <div className="col" style={{ gap: 8, marginTop: 8 }}>
              <code
                className="mono small"
                style={{
                  wordBreak: 'break-all',
                  background: 'var(--bg-3)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  display: 'block',
                }}
              >
                curl -H "Authorization: Bearer tvk_…" {window.location.origin}/v1/symbols?q=btc
              </code>
              <code
                className="mono small"
                style={{
                  wordBreak: 'break-all',
                  background: 'var(--bg-3)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  display: 'block',
                }}
              >
                curl -H "Authorization: Bearer tvk_…" {window.location.origin}/v1/indicators
              </code>
              <code
                className="mono small"
                style={{
                  wordBreak: 'break-all',
                  background: 'var(--bg-3)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  display: 'block',
                }}
              >
                curl -H "Authorization: Bearer tvk_…" -d @body.json {window.location.origin}
                /v1/indicators/compute
              </code>
              <code
                className="mono small"
                style={{
                  wordBreak: 'break-all',
                  background: 'var(--bg-3)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  display: 'block',
                }}
              >
                curl -H "Authorization: Bearer tvk_…" -d @body.json {window.location.origin}
                /v1/screener
              </code>
              <code
                className="mono small"
                style={{
                  wordBreak: 'break-all',
                  background: 'var(--bg-3)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  display: 'block',
                }}
              >
                curl -H "Authorization: Bearer tvk_…" {window.location.origin}
                /v1/news?source=newsapi&amp;limit=10
              </code>
              <code
                className="mono small"
                style={{
                  wordBreak: 'break-all',
                  background: 'var(--bg-3)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  display: 'block',
                }}
              >
                curl -H "Authorization: Bearer tvk_…" -d @watchlist.json {window.location.origin}
                /v1/watchlists
              </code>
              <code
                className="mono small"
                style={{
                  wordBreak: 'break-all',
                  background: 'var(--bg-3)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  display: 'block',
                }}
              >
                const ws = new WebSocket("{publicWsUrl}")
              </code>
            </div>
          </div>
          {tokensQ.isLoading && <p className="muted">Loading...</p>}
          <div className="col">
            {tokensQ.data?.tokens.map((t) => (
              <div key={t.id} className="card">
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div className="muted small mono">
                      tvk_{t.prefix}… · {t.scopes.join(', ') || 'read'} ·{' '}
                      {t.lastUsedAt
                        ? `used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                        : 'never used'}
                    </div>
                  </div>
                  <span className="grow" />
                  {t.revokedAt ? (
                    <span className="muted small">revoked</span>
                  ) : (
                    <button
                      className="ghost"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(t.id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
            {tokensQ.data?.tokens.length === 0 && <p className="muted">No API keys yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
