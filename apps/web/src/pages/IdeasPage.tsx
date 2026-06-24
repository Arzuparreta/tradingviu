import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';
import type { FollowUser, IdeaDirection, IdeaRow } from '../api/types';

const directions: IdeaDirection[] = ['long', 'short', 'neutral'];
const directionClass: Record<IdeaDirection, string> = {
  long: 'up',
  short: 'down',
  neutral: 'muted',
};

type FeedFilter = 'all' | 'mine' | 'following';

function FollowButton({ userId, following }: { userId: string; following: boolean }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => (following ? api.unfollowUser(userId) : api.followUser(userId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['follows'] });
    },
  });
  return (
    <button
      className={following ? '' : 'primary'}
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}

function IdeaCard({ idea, userId }: { idea: IdeaRow; userId: string | undefined }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');

  const refreshFeed = () => queryClient.invalidateQueries({ queryKey: ['ideas'] });

  const commentsQ = useQuery({
    queryKey: ['ideaComments', idea.id],
    queryFn: () => api.ideaComments(idea.id),
    enabled: open,
  });

  const toggleLike = useMutation({
    mutationFn: () => (idea.liked ? api.unlikeIdea(idea.id) : api.likeIdea(idea.id)),
    onSuccess: refreshFeed,
  });

  const addComment = useMutation({
    mutationFn: () => api.addIdeaComment(idea.id, { body: comment.trim() }),
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['ideaComments', idea.id] });
      refreshFeed();
    },
  });

  const removeComment = useMutation({
    mutationFn: (commentId: string) => api.deleteIdeaComment(idea.id, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideaComments', idea.id] });
      refreshFeed();
    },
  });

  return (
    <div className="card">
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
          <div className="row" style={{ gap: 8 }}>
            <button
              className={idea.liked ? 'primary' : ''}
              onClick={() => toggleLike.mutate()}
              disabled={toggleLike.isPending}
            >
              ♥ {idea.likesCount}
            </button>
            <button onClick={() => setOpen((v) => !v)}>💬 {idea.commentsCount}</button>
          </div>
          {userId === idea.author.id ? (
            <DeleteIdeaButton id={idea.id} onDone={refreshFeed} />
          ) : (
            <FollowButton userId={idea.author.id} following={idea.author.following ?? false} />
          )}
        </div>
      </div>

      {open && (
        <div className="col" style={{ marginTop: 12, gap: 8 }}>
          {commentsQ.isLoading && <p className="muted small">Loading comments…</p>}
          {commentsQ.data?.comments.map((cm) => (
            <div key={cm.id} className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div>
                <span className="small" style={{ fontWeight: 600 }}>
                  {cm.author.displayName ?? cm.author.email}
                </span>{' '}
                <span className="muted small">{new Date(cm.createdAt).toLocaleString()}</span>
                <p className="small" style={{ whiteSpace: 'pre-wrap', margin: '2px 0 0' }}>
                  {cm.body}
                </p>
              </div>
              <span className="grow" />
              {userId === cm.author.id && (
                <button onClick={() => removeComment.mutate(cm.id)} disabled={removeComment.isPending}>
                  ✕
                </button>
              )}
            </div>
          ))}
          {commentsQ.data?.comments.length === 0 && (
            <p className="muted small">No comments yet.</p>
          )}
          <div className="row" style={{ gap: 8 }}>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && comment.trim()) addComment.mutate();
              }}
            />
            <button
              className="primary"
              disabled={comment.trim().length === 0 || addComment.isPending}
              onClick={() => addComment.mutate()}
            >
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeleteIdeaButton({ id, onDone }: { id: string; onDone: () => void }) {
  const remove = useMutation({ mutationFn: () => api.deleteIdea(id), onSuccess: onDone });
  return (
    <button onClick={() => remove.mutate()} disabled={remove.isPending}>
      Delete
    </button>
  );
}

function PersonRow({ person, following }: { person: FollowUser; following: boolean }) {
  return (
    <div className="row" style={{ alignItems: 'center', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div className="small" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {person.displayName ?? person.email}
        </div>
        <div className="muted small">
          {person.ideasCount} {person.ideasCount === 1 ? 'idea' : 'ideas'}
        </div>
      </div>
      <span className="grow" />
      <FollowButton userId={person.id} following={following} />
    </div>
  );
}

function PeoplePanel() {
  const followingQ = useQuery({ queryKey: ['follows', 'following'], queryFn: api.following });
  const suggestionsQ = useQuery({
    queryKey: ['follows', 'suggestions'],
    queryFn: api.followSuggestions,
  });

  return (
    <section className="card">
      <div className="col" style={{ gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Following</div>
          {followingQ.data?.users.length === 0 && (
            <p className="muted small">You're not following anyone yet.</p>
          )}
          <div className="col" style={{ gap: 8 }}>
            {followingQ.data?.users.map((u) => (
              <PersonRow key={u.id} person={u} following />
            ))}
          </div>
        </div>
        {suggestionsQ.data && suggestionsQ.data.users.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Suggested authors</div>
            <div className="col" style={{ gap: 8 }}>
              {suggestionsQ.data.users.map((u) => (
                <PersonRow key={u.id} person={u} following={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

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
    queryFn: () =>
      api.ideas(filter === 'all' ? {} : { author: filter === 'mine' ? 'me' : 'following' }),
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

  return (
    <div className="page">
      <h1>Ideas</h1>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div className="col" style={{ width: 340, gap: 16 }}>
        <section className="card">
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
            {create.isError && <p className="down small">{(create.error as Error).message}</p>}
          </div>
        </section>

        <PeoplePanel />
        </div>

        <section style={{ flex: 1 }}>
          <div className="row" style={{ marginBottom: 12, gap: 8 }}>
            <button className={filter === 'all' ? 'primary' : ''} onClick={() => setFilter('all')}>
              All ideas
            </button>
            <button className={filter === 'mine' ? 'primary' : ''} onClick={() => setFilter('mine')}>
              My ideas
            </button>
            <button
              className={filter === 'following' ? 'primary' : ''}
              onClick={() => setFilter('following')}
            >
              Following
            </button>
          </div>
          {ideasQ.isLoading && <p className="muted">Loading…</p>}
          <div className="col">
            {ideasQ.data?.ideas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} userId={user?.id} />
            ))}
            {ideasQ.data?.ideas.length === 0 && <p className="muted">No ideas yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
