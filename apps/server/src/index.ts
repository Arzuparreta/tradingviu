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
import { wsRoutes } from './routes/ws.js';
import { adminRoutes } from './routes/admin.js';
import { tenantContext } from './middleware/tenant.js';
import { superAdminContext } from './middleware/super-admin.js';
import { errorHandler } from './middleware/error.js';

const env = loadEnv();

const db = createDb({ url: env.DATABASE_URL });

const redis: import('redis').RedisClientType = createRedisClient({ url: env.REDIS_URL }) as never;
await redis.connect();

const app = new Hono();

app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', cors({ origin: env.CORS_ORIGIN, credentials: true, allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));

app.onError(errorHandler);

app.get('/', (c) => c.json({ name: 'tradingviu', status: 'ok', version: '0.1.0' }));

app.route('/auth', authRoutes);
app.route('/health', healthRoutes);
app.use('/admin/*', superAdminContext({ db, redis }));
app.route('/admin', adminRoutes);

app.use('/api/*', tenantContext({ db, redis }));
app.route('/api', symbolRoutes);
app.route('/api', chartRoutes);
app.route('/api', billingRoutes);
app.route('/ws', wsRoutes);

const port = env.API_PORT;
console.log(`tradingviu api listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 120,
};

export { app, db, redis };
