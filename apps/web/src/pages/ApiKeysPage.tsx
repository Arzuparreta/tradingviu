import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';

export function ApiKeysPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);

  const tokensQ = useQuery({ queryKey: ['access-tokens'], queryFn: () => api.accessTokens(), enabled: !!user });

  const create = useMutation({
    mutationFn: () => api.createAccessToken({ name: name.trim() }),
    onSuccess: (r) => {
      setCreated({ name: name.trim(), key: r.key });
      setName('');
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
        <p>You need to <Link to="/login">log in</Link> to manage API keys.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>API keys</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Personal access tokens for the public read API. See the{' '}
        <a href="/openapi.json" target="_blank" rel="noreferrer">OpenAPI spec</a>.
      </p>

      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <section className="card" style={{ width: 340 }}>
          <div className="col">
            <div>
              <label>Key name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My script" />
            </div>
            <button className="primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
              Create key
            </button>
            {created && (
              <div className="card" style={{ background: 'var(--bg-3)' }}>
                <div className="small up">Copy this key now — it won't be shown again.</div>
                <code className="mono small" style={{ wordBreak: 'break-all', display: 'block', marginTop: 6 }}>
                  {created.key}
                </code>
                <button className="ghost small" style={{ marginTop: 6 }} onClick={() => navigator.clipboard?.writeText(created.key)}>
                  Copy
                </button>
              </div>
            )}
          </div>
        </section>

        <section style={{ flex: 1, minWidth: 0 }}>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="small muted">Use it</div>
            <code className="mono small" style={{ display: 'block', marginTop: 4, wordBreak: 'break-all' }}>
              curl -H "Authorization: Bearer tvk_…" {window.location.origin}/v1/symbols
            </code>
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
                      {t.lastUsedAt ? `used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'never used'}
                    </div>
                  </div>
                  <span className="grow" />
                  {t.revokedAt ? (
                    <span className="muted small">revoked</span>
                  ) : (
                    <button className="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(t.id)}>
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
