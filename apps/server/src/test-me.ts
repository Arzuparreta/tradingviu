import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb } from '@tv/db';
import { users } from '@tv/db/schema';
import { loadEnv } from '@tv/core';

const env = loadEnv();
console.log('DATABASE_URL:', env.DATABASE_URL);
console.log('DATABASE_URL_ADMIN:', env.DATABASE_URL_ADMIN);
const adminUrl = env.DATABASE_URL_ADMIN ?? env.DATABASE_URL;
console.log('adminUrl:', adminUrl);
const db = createDb({ url: adminUrl });
const app = new Hono();
app.get('/probe/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return c.json({ found: !!u, user: u ?? null, adminUrl });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
app.get('/health', (c) => c.json({ ok: true }));
export default { port: 3099, fetch: app.fetch };
