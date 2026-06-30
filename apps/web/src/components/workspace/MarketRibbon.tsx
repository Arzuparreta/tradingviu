import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });

/** Bottom market ribbon: latest indexed headlines, scrolling horizontally. */
export function MarketRibbon() {
  const newsQ = useQuery({
    queryKey: ['ribbon-news'],
    queryFn: () => api.news({ limit: 16 }),
    staleTime: 60_000,
  });
  const articles = newsQ.data?.articles ?? [];

  return (
    <div className="ws-ribbon">
      <span className="ws-ribbon-label">News</span>
      {articles.length === 0 && (
        <span className="ws-ribbon-item muted">{newsQ.isLoading ? 'Loading…' : 'No headlines'}</span>
      )}
      {articles.map((n) => (
        <a
          key={n.id}
          className="ws-ribbon-item"
          href={n.url}
          target="_blank"
          rel="noreferrer"
          title={n.title}
        >
          <span className="muted">{timeFmt.format(new Date(n.publishedAt))}</span>
          <strong>{n.title}</strong>
        </a>
      ))}
    </div>
  );
}
