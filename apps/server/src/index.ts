import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { loadEnv } from '@tv/core';
import { createDb } from '@tv/db';
import { createClient as createRedisClient } from 'redis';
import { authRoutes } from './routes/auth.js';
import { symbolRoutes, chartRoutes } from './routes/symbols.js';
import { billingRoutes } from './routes/billing.js';
import { healthRoutes } from './routes/health.js';
import { adminRoutes } from './routes/admin.js';
import { indicatorRoutes } from './routes/indicators.js';
import { patternRoutes } from './routes/patterns.js';
import { chartPatternRoutes } from './routes/chart-patterns.js';
import { volumeProfileRoutes } from './routes/volume-profile.js';
import { tpoProfileRoutes } from './routes/tpo-profile.js';
import { watchlistRoutes } from './routes/watchlists.js';
import { searchRoutes } from './routes/search.js';
import { layoutRoutes } from './routes/layouts.js';
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
import { errorHandler } from './middleware/error.js';
import { wsHandlers } from './services/ws.js';
import { indexAllSymbols, searchEnabled } from './services/search.js';
import { initBarStore, getBarStore, shutdownBarStore } from './services/data.js';

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
app.route('/api', watchlistRoutes);
app.route('/api', searchRoutes);
app.route('/api', layoutRoutes);
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
  fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const ok = _server.upgrade(req, { data: undefined });
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
  console.log('[shutdown] done');
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

// Avoid unused-import warning when getBarStore is not called here directly.
void getBarStore;

export default server;

export { app, db, redis, barStore };
