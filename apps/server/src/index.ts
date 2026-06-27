import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { isTvError, loadEnv } from '@tv/core';
import { createDb } from '@tv/db';
import { createClient as createRedisClient } from 'redis';
import { authRoutes } from './routes/auth.js';
import { symbolRoutes, chartRoutes } from './routes/symbols.js';
import { billingRoutes } from './routes/billing.js';
import { accessTokenRoutes } from './routes/access-tokens.js';
import { publicV1Routes, openApiDocument } from './routes/public-v1.js';
import { healthRoutes } from './routes/health.js';
import { adminRoutes } from './routes/admin.js';
import { indicatorRoutes } from './routes/indicators.js';
import { patternRoutes } from './routes/patterns.js';
import { chartPatternRoutes } from './routes/chart-patterns.js';
import { volumeProfileRoutes } from './routes/volume-profile.js';
import { tpoProfileRoutes } from './routes/tpo-profile.js';
import { ichimokuRoutes } from './routes/ichimoku.js';
import { backtestRoutes } from './routes/backtest.js';
import { pivotPointsRoutes } from './routes/pivot-points.js';
import { watchlistRoutes } from './routes/watchlists.js';
import { searchRoutes } from './routes/search.js';
import { layoutRoutes } from './routes/layouts.js';
import { drawingRoutes } from './routes/drawings.js';
import { pineRoutes } from './routes/pine.js';
import { alertRoutes } from './routes/alerts.js';
import { portfolioRoutes } from './routes/portfolios.js';
import { paperRoutes } from './routes/paper.js';
import { optionsRoutes } from './routes/options.js';
import { brokerRoutes } from './routes/brokers.js';
import { discoveryRoutes } from './routes/discovery.js';
import { screenerRoutes } from './routes/screener.js';
import { ideaRoutes } from './routes/ideas.js';
import { followRoutes } from './routes/follows.js';
import { scriptRoutes } from './routes/scripts.js';
import { spaceRoutes } from './routes/spaces.js';
import { tenantContext } from './middleware/tenant.js';
import { superAdminContext } from './middleware/super-admin.js';
import { apiKeyContext } from './middleware/api-key.js';
import { rateLimit } from './services/rate-limit.js';
import { errorHandler } from './middleware/error.js';
import { wsHandlers } from './services/ws.js';
import { authenticateWsApiKey, authenticateWsToken, readWsApiKey } from './services/ws-auth.js';
import { indexAllSymbols, searchEnabled } from './services/search.js';
import { initBarStore, getBarStore, shutdownBarStore } from './services/data.js';
import { shutdownMarketStore } from './services/market-store.js';

const env = loadEnv();

const db = createDb({ url: env.DATABASE_URL });

const redis: import('redis').RedisClientType = createRedisClient({ url: env.REDIS_URL }) as never;
await redis.connect();

// BarStore: the single source of truth for live market data. One upstream per
// (provider, ticker, interval) globally; fanout to N WS clients. Persistence
// to TimescaleDB happens on bar close via a batched write queue.
const barStore = initBarStore(db, {
  systemUserId: env.SYSTEM_USER_ID ?? 'system',
});

const app = new Hono();

app.use('*', logger());
app.use('*', secureHeaders());
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.onError(errorHandler);

app.get('/', (c) => c.json({ name: 'tradingviu', status: 'ok', version: '0.1.0' }));

// Public diagnostics for the bar store. No tenant context required.
app.get('/chart/status', (c) => c.json({ streams: barStore.stats() }));

app.route('/auth', authRoutes);
app.route('/health', healthRoutes);
app.use('/admin/*', superAdminContext({ db, redis }));
app.route('/admin', adminRoutes);

app.use('/api/*', tenantContext({ db, redis }));
app.route('/api', symbolRoutes);
app.route('/api', chartRoutes);
app.route('/api', indicatorRoutes);
app.route('/api', patternRoutes);
app.route('/api', chartPatternRoutes);
app.route('/api', volumeProfileRoutes);
app.route('/api', tpoProfileRoutes);
app.route('/api', ichimokuRoutes);
app.route('/api', backtestRoutes);
app.route('/api', pivotPointsRoutes);
app.route('/api', watchlistRoutes);
app.route('/api', searchRoutes);
app.route('/api', layoutRoutes);
app.route('/api', drawingRoutes);
app.route('/api', pineRoutes);
app.route('/api', alertRoutes);
app.route('/api', portfolioRoutes);
app.route('/api', paperRoutes);
app.route('/api', optionsRoutes);
app.route('/api', brokerRoutes);
app.route('/api', discoveryRoutes);
app.route('/api', screenerRoutes);
app.route('/api', ideaRoutes);
app.route('/api', followRoutes);
app.route('/api', scriptRoutes);
app.route('/api', spaceRoutes);
app.route('/api', billingRoutes);
app.route('/api', accessTokenRoutes);

// Public API: OpenAPI spec is unauthenticated; /v1/* requires a personal access
// token (resolved by apiKeyContext, outside the JWT-based /api/* middleware).
app.get('/openapi.json', (c) => c.json(openApiDocument));
app.use('/v1/*', apiKeyContext({ db, redis }));
app.use(
  '/v1/*',
  rateLimit(redis, { limit: env.API_RATE_LIMIT, windowSec: env.API_RATE_WINDOW_SEC }),
);
app.route('/v1', publicV1Routes);

const port = env.API_PORT;
console.log(`tradingviu api listening on :${port}`);

// Index symbols into Meili on boot (fire-and-forget; search degrades to DB if unavailable).
if (searchEnabled()) {
  indexAllSymbols(db)
    .then((n) => console.log(`[search] indexed ${n} symbols into meili`))
    .catch((err) => console.warn('[search] initial symbol index failed:', (err as Error).message));
} else {
  console.log('[search] MEILI_HOST not set — symbol search will use DB fallback');
}

const _server: ReturnType<typeof Bun.serve> = Bun.serve({
  port,
  async fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('WebSocket upgrade required', { status: 426 });
      }
      const token = url.searchParams.get('token') ?? '';
      let wsData: {
        userId: string;
        tenantId: string;
        auth: 'session' | 'apiKey';
        apiTokenPrefix?: string;
      };
      try {
        wsData = await authenticateWsToken(db, token, env.JWT_SECRET);
      } catch (err) {
        return new Response('Unauthorized', { status: isTvError(err) ? err.status : 401 });
      }
      const ok = _server.upgrade(req, { data: wsData });
      if (ok) return undefined;
    }
    if (url.pathname === '/v1/ws') {
      if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('WebSocket upgrade required', { status: 426 });
      }
      let wsData: {
        userId: string;
        tenantId: string;
        auth: 'session' | 'apiKey';
        apiTokenPrefix?: string;
      };
      try {
        wsData = await authenticateWsApiKey(db, redis, readWsApiKey(req, url), {
          limit: env.API_RATE_LIMIT,
          windowSec: env.API_RATE_WINDOW_SEC,
        });
      } catch (err) {
        return new Response('Unauthorized', { status: isTvError(err) ? err.status : 401 });
      }
      const ok = _server.upgrade(req, { data: wsData });
      if (ok) return undefined;
    }
    return app.fetch(req);
  },
  websocket: wsHandlers,
  idleTimeout: 120,
});
const server = _server;

// Graceful shutdown: flush the persist queue, close all streams.
const shutdown = async (): Promise<void> => {
  console.log('[shutdown] draining bar store…');
  await shutdownBarStore();
  shutdownMarketStore();
  console.log('[shutdown] done');
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

// Avoid unused-import warning when getBarStore is not called here directly.
void getBarStore;

export default server;

export { app, db, redis, barStore };
