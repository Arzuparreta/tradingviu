import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb } from '@tv/db';
import { loadEnv } from '@tv/core';

const env = loadEnv();
const db = createDb({ url: env.DATABASE_URL });

export const healthRoutes = new Hono()
  .get('/', async (c) => {
    let dbOk = false;
    try {
      const r = await db.execute<{ ok: number }>('SELECT 1 AS ok');
      dbOk = r[0]?.ok === 1;
    } catch {
      dbOk = false;
    }
    return c.json({ status: dbOk ? 'ok' : 'degraded', db: dbOk, version: '0.1.0', time: Date.now() });
  })
  .get('/deep', async (c) => {
    const out: Record<string, unknown> = { time: Date.now() };
    try {
      const r = await db.execute<{ now: string }>("SELECT NOW()::text AS now");
      out.db = r[0]?.now;
    } catch (e) {
      out.db = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
    return c.json(out);
  });
