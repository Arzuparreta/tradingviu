import { sql } from 'drizzle-orm';
import {
  EnvSchema,
  NewsIngestQuerySchema,
  type NewsIngestQuery,
  type NormalizedNewsArticle,
} from '@tv/core';
import { createDb, clearRls, withSuperAdminRls, type Database } from '@tv/db';
import { newsArticles } from '@tv/db/schema';
import { createNewsProvider, fetchNormalizedNews, type NewsProvider } from '@tv/news';

const NewsIngestEnvSchema = EnvSchema.pick({
  DATABASE_URL: true,
  DATABASE_URL_ADMIN: true,
  NEWS_PROVIDER: true,
  NEWS_INGEST_INTERVAL_SECONDS: true,
});

export interface NewsIngestResult {
  readonly provider: string;
  readonly fetched: number;
  readonly upserted: number;
}

const parseSymbols = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((symbol) => symbol.trim())
    .filter((symbol) => symbol.length > 0);
};

export const buildQueryFromEnv = (source: NodeJS.ProcessEnv = process.env): NewsIngestQuery => {
  const input = {
    symbols: parseSymbols(source.NEWS_INGEST_SYMBOLS),
    ...(source.NEWS_INGEST_FROM ? { from: source.NEWS_INGEST_FROM } : {}),
    ...(source.NEWS_INGEST_TO ? { to: source.NEWS_INGEST_TO } : {}),
    ...(source.NEWS_INGEST_LIMIT ? { limit: source.NEWS_INGEST_LIMIT } : {}),
  };
  return NewsIngestQuerySchema.parse(input);
};

const toInsertRows = (articles: readonly NormalizedNewsArticle[]) =>
  articles.map((article) => ({
    source: article.source,
    url: article.url,
    title: article.title,
    symbols: article.symbols,
    publishedAt: article.publishedAt,
    fetchedAt: article.fetchedAt,
    ...(article.body ? { body: article.body } : {}),
    ...(article.sentiment ? { sentiment: article.sentiment } : {}),
  }));

export const ingestNewsOnce = async (
  db: Database,
  provider: NewsProvider,
  query: NewsIngestQuery,
): Promise<NewsIngestResult> => {
  const articles = await fetchNormalizedNews(provider, query);
  if (articles.length === 0) return { provider: provider.id, fetched: 0, upserted: 0 };

  const rows = toInsertRows(articles);
  const upserted = await db.transaction(async (txDb) => {
    await withSuperAdminRls(txDb as never, 'news-ingest');
    try {
      return await txDb
        .insert(newsArticles)
        .values(rows)
        .onConflictDoUpdate({
          target: newsArticles.url,
          set: {
            source: sql`excluded.source`,
            title: sql`excluded.title`,
            body: sql`excluded.body`,
            symbols: sql`excluded.symbols`,
            sentiment: sql`excluded.sentiment`,
            publishedAt: sql`excluded.published_at`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        })
        .returning({ id: newsArticles.id });
    } finally {
      await clearRls(txDb as never);
    }
  });

  return { provider: provider.id, fetched: articles.length, upserted: upserted.length };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const run = async (): Promise<void> => {
  const env = NewsIngestEnvSchema.parse(process.env);
  const provider = createNewsProvider(env.NEWS_PROVIDER);
  const adminUrl = env.DATABASE_URL_ADMIN ?? env.DATABASE_URL;
  const db = createDb({ url: adminUrl, max: 1 });
  const query = buildQueryFromEnv();
  const intervalSeconds = env.NEWS_INGEST_INTERVAL_SECONDS;
  const once = process.argv.includes('--once');

  do {
    const result = await ingestNewsOnce(db, provider, query);
    console.log(
      `[news-ingest] provider=${result.provider} fetched=${result.fetched} upserted=${result.upserted}`,
    );
    if (once) break;
    await sleep(intervalSeconds * 1000);
  } while (true);
};

if (import.meta.main) {
  run()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[news-ingest] failed: ${message}`);
      process.exit(1);
    });
}
