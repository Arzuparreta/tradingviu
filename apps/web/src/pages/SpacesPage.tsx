import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useAuth } from '../stores/auth';
import type { SpaceRow, SpaceVisibility, SpacesSort } from '../api/types';

const visibilities: SpaceVisibility[] = ['public', 'private'];

type FeedFilter = 'all' | 'mine' | 'subscribed';

const formatPrice = (cents: number, currency: string): string =>
  cents === 0 ? 'Free' : `${(cents / 100).toFixed(2)} ${currency}/mo`;

function SpacePosts({ spaceId, isOwner }: { spaceId: string; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const postsQ = useQuery({
    queryKey: ['spacePosts', spaceId],
    queryFn: () => api.spacePosts(spaceId),
    retry: false,
  });

  const addPost = useMutation({
    mutationFn: () =>
      api.addSpacePost(spaceId, { body: body.trim(), ...(title.trim() ? { title: title.trim() } : {}) }),
    onSuccess: () => {
      setTitle('');
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['spacePosts', spaceId] });
    },
  });

  const removePost = useMutation({
    mutationFn: (postId: string) => api.deleteSpacePost(spaceId, postId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['spacePosts', spaceId] }),
  });

  const locked = postsQ.error instanceof ApiError && postsQ.error.status === 403;

  return (
    <div className="col" style={{ marginTop: 12, gap: 8 }}>
      {isOwner && (
        <div className="card" style={{ background: 'var(--surface-2, #11151c)' }}>
          <div className="col" style={{ gap: 6 }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title (optional)"
              maxLength={200}
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share an update with your subscribers"
              rows={3}
            />
            <button
              className="primary"
              disabled={body.trim().length === 0 || addPost.isPending}
              onClick={() => addPost.mutate()}
            >
              Post
            </button>
          </div>
        </div>
      )}

      {postsQ.isLoading && <p className="muted small">Loading…</p>}
      {locked && <p className="muted small">🔒 Subscribe to read this space.</p>}
      {postsQ.data?.posts.map((p) => (
        <div key={p.id} className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
          <div>
            {p.title && <div style={{ fontWeight: 600 }}>{p.title}</div>}
            <p className="small" style={{ whiteSpace: 'pre-wrap', margin: '2px 0 0' }}>
              {p.body}
            </p>
            <div className="muted small">{new Date(p.createdAt).toLocaleString()}</div>
          </div>
          <span className="grow" />
          {isOwner && (
            <button onClick={() => removePost.mutate(p.id)} disabled={removePost.isPending}>
              ✕
            </button>
          )}
        </div>
      ))}
      {!locked && postsQ.data?.posts.length === 0 && (
        <p className="muted small">No posts yet.</p>
      )}
    </div>
  );
}

function SpaceCard({ space, userId }: { space: SpaceRow; userId: string | undefined }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isOwner = userId === space.owner.id;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['spaces'] });

  const toggleSub = useMutation({
    mutationFn: () =>
      space.subscribed ? api.unsubscribeSpace(space.id) : api.subscribeSpace(space.id),
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['spacePosts', space.id] });
    },
  });

  const remove = useMutation({ mutationFn: () => api.deleteSpace(space.id), onSuccess: refresh });

  return (
    <div className="card">
      <div className="row">
        <div>
          <div style={{ fontWeight: 600 }}>
            {space.name}
            {space.visibility === 'private' && (
              <span className="muted small" style={{ marginLeft: 8 }}>
                · private
              </span>
            )}
          </div>
          <div className="muted small mono">
            {formatPrice(space.priceCents, space.currency)} · {space.subscribersCount}{' '}
            {space.subscribersCount === 1 ? 'subscriber' : 'subscribers'} ·{' '}
            {space.owner.displayName ?? space.owner.email}
          </div>
          {space.description && (
            <p className="small" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
              {space.description}
            </p>
          )}
        </div>
        <span className="grow" />
        <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
          <div className="row" style={{ gap: 8 }}>
            <button onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Open'}</button>
            {isOwner ? (
              <span className="small up">Owner</span>
            ) : (
              <button
                className={space.subscribed ? '' : 'primary'}
                onClick={() => toggleSub.mutate()}
                disabled={toggleSub.isPending}
              >
                {space.subscribed
                  ? 'Subscribed'
                  : space.priceCents === 0
                    ? 'Subscribe'
                    : `Subscribe · ${formatPrice(space.priceCents, space.currency)}`}
              </button>
            )}
          </div>
          {isOwner && (
            <button onClick={() => remove.mutate()} disabled={remove.isPending}>
              Delete
            </button>
          )}
        </div>
      </div>

      {open && <SpacePosts spaceId={space.id} isOwner={isOwner} />}
    </div>
  );
}

export function SpacesPage() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<SpaceVisibility>('public');
  const [price, setPrice] = useState('0');
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [sort, setSort] = useState<SpacesSort>('recent');

  const spacesQ = useQuery({
    queryKey: ['spaces', filter, sort],
    queryFn: () =>
      api.spaces({
        sort,
        ...(filter === 'mine' ? { owner: 'me' } : {}),
        ...(filter === 'subscribed' ? { subscribed: true } : {}),
      }),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createSpace({
        name: name.trim(),
        visibility,
        priceCents: Math.round(Number(price) * 100) || 0,
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    onSuccess: () => {
      setName('');
      setDescription('');
      setPrice('0');
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });

  return (
    <div className="page">
      <h1>Spaces</h1>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <section className="card" style={{ width: 360 }}>
          <div className="col">
            <div>
              <label>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Momentum Traders"
                maxLength={160}
              />
            </div>
            <div>
              <label>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's inside? (optional)"
                rows={3}
              />
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Visibility</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as SpaceVisibility)}
                >
                  {visibilities.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Price (USD/mo)</label>
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
              disabled={name.trim().length === 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              Create space
            </button>
            {create.isError && <p className="down small">{(create.error as Error).message}</p>}
            <p className="muted small">
              Paid spaces grant access on subscribe (payment gateway is a follow-up).
            </p>
          </div>
        </section>

        <section style={{ flex: 1 }}>
          <div className="row" style={{ marginBottom: 12, gap: 8 }}>
            <button className={filter === 'all' ? 'primary' : ''} onClick={() => setFilter('all')}>
              Discover
            </button>
            <button className={filter === 'mine' ? 'primary' : ''} onClick={() => setFilter('mine')}>
              Mine
            </button>
            <button
              className={filter === 'subscribed' ? 'primary' : ''}
              onClick={() => setFilter('subscribed')}
            >
              Subscribed
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
          {spacesQ.isLoading && <p className="muted">Loading…</p>}
          <div className="col">
            {spacesQ.data?.spaces.map((s) => (
              <SpaceCard key={s.id} space={s} userId={user?.id} />
            ))}
            {spacesQ.data?.spaces.length === 0 && <p className="muted">No spaces yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
