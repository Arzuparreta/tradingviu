import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { tryGetTenant, type TenantContext } from '@tv/core';
import { generateApiKey } from '@tv/auth';
import { accessTokens } from '@tv/db/schema';

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.string().trim().min(1).max(40)).max(20).default(['read']),
  expiresAt: z.coerce.date().optional(),
});

/** Personal access token management for the public API (under JWT auth). */
export const accessTokenRoutes = new Hono()
  .get('/access-tokens', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const rows = await db
      .select({
        id: accessTokens.id,
        name: accessTokens.name,
        prefix: accessTokens.prefix,
        scopes: accessTokens.scopes,
        lastUsedAt: accessTokens.lastUsedAt,
        expiresAt: accessTokens.expiresAt,
        revokedAt: accessTokens.revokedAt,
        createdAt: accessTokens.createdAt,
      })
      .from(accessTokens)
      .where(and(eq(accessTokens.tenantId, tenant.tenantId), eq(accessTokens.userId, tenant.userId)))
      .orderBy(desc(accessTokens.createdAt));
    return c.json({ tokens: rows });
  })
  .post('/access-tokens', zValidator('json', CreateBody), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const body = c.req.valid('json');
    const id = ulid();
    const generated = generateApiKey();

    await db.insert(accessTokens).values({
      id,
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      name: body.name,
      prefix: generated.prefix,
      hash: generated.hash,
      scopes: body.scopes,
      ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
    });

    // The full key is returned exactly once.
    return c.json({ id, prefix: generated.prefix, key: generated.key });
  })
  .delete('/access-tokens/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    await db
      .update(accessTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(accessTokens.id, id),
          eq(accessTokens.tenantId, tenant.tenantId),
          eq(accessTokens.userId, tenant.userId),
        ),
      );
    return c.json({ ok: true });
  });
