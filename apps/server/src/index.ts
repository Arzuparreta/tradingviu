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
import { watchlistRoutes } from './routes/watchlists.js';
import { searchRoutes } from './routes/search.js';
import { layoutRoutes } from './routes/layouts.js';
import { pineRoutes } from './routes/pine.js';
import { alertRoutes } from './routes/alerts.js';
import { portfolioRoutes } from './routes/portfolios.js';
import { paperRoutes } from './routes/paper.js';
import { optionsRoutes } from './routes/options.js';
import { brokerRoutes } from './routes/brokers.js';
import { tenantContext } from './middleware/tenant.js';
import { superAdminContext } from './middleware/super-admin.js';
import { errorHandler } from './middleware/error.js';
import { wsHandlers } from './services/ws.js';
import { indexAllSymbols, searchEnabled } from './services/search.js';

const env = loadEnv();

const db = createDb({ url: env.DATABASE_URL });

const redis: import('redis').RedisClientType = createRedisClient({ url: env.REDIS_URL }) as never;
await redis.connect();

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

app.route('/auth', authRoutes);
app.route('/health', healthRoutes);
app.use('/admin/*', superAdminContext({ db, redis }));
app.route('/admin', adminRoutes);

app.use('/api/*', tenantContext({ db, redis }));
app.route('/api', symbolRoutes);
app.route('/api', chartRoutes);
app.route('/api', indicatorRoutes);
app.route('/api', watchlistRoutes);
app.route('/api', searchRoutes);
app.route('/api', layoutRoutes);
app.route('/api', pineRoutes);
app.route('/api', alertRoutes);
app.route('/api', portfolioRoutes);
app.route('/api', paperRoutes);
app.route('/api', optionsRoutes);
app.route('/api', brokerRoutes);
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

export default server;

export { app, db, redis };
