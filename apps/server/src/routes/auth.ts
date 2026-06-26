import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { setCookie, deleteCookie } from 'hono/cookie';
import { and, eq } from 'drizzle-orm';
import { createDb } from '@tv/db';
import { users, tenantMembers, tenants } from '@tv/db/schema';
import { signup, issueAccessToken, verifyPassword } from '@tv/auth';
import { loadEnv, AuthError, ValidationError } from '@tv/core';
import { withSuperAdminRls, clearRls } from '@tv/db';
import { resolveAuthAdminDatabaseUrl } from '../services/auth-admin-db.js';

const env = loadEnv();
// Auth bootstrap uses the admin connection because signup needs to insert into
// users/tenants before any tenant context exists. RLS on users uses tenant context,
// which is a chicken-and-egg for new signups. Admin connection bypasses RLS.
const adminUrl = resolveAuthAdminDatabaseUrl(env);
const db = createDb({ url: adminUrl });

const SignupBody = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(200),
  displayName: z.string().min(1).max(80).optional(),
  tenantName: z.string().min(1).max(80).optional(),
  tenantSlug: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/)
    .optional(),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().optional(),
});

export const authRoutes = new Hono()
  .post('/signup', zValidator('json', SignupBody), async (c) => {
    const body = c.req.valid('json');
    const cleanBody: {
      email: string;
      password: string;
      displayName?: string;
      tenantName?: string;
      tenantSlug?: string;
    } = {
      email: body.email,
      password: body.password,
    };
    if (body.displayName) cleanBody.displayName = body.displayName;
    if (body.tenantName) cleanBody.tenantName = body.tenantName;
    if (body.tenantSlug) cleanBody.tenantSlug = body.tenantSlug;
    const { userId, tenantId, isFirstUser, user, tenant, member } = await db.transaction(
      async (txDb) => {
        const { withSuperAdminRls, clearRls } = await import('@tv/db');
        await withSuperAdminRls(txDb as never, 'system');
        try {
          const { userId, tenantId, isFirstUser } = await signup(txDb as never, cleanBody);
          const [u] = await txDb.select().from(users).where(eq(users.id, userId)).limit(1);
          if (!u) throw new ValidationError('User not found after signup');
          const [t] = await txDb.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
          if (!t) throw new ValidationError('Tenant not found after signup');
          const [m] = await txDb
            .select()
            .from(tenantMembers)
            .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, tenantId)))
            .limit(1);
          if (!m) throw new ValidationError('Membership not found after signup');
          return { userId, tenantId, isFirstUser, user: u, tenant: t, member: m };
        } finally {
          await clearRls(txDb as never);
        }
      },
    );
    const token = await issueAccessToken(
      {
        sub: userId,
        email: user.email,
        tid: tenantId,
        role: member.role,
        plan: tenant.planCode,
        sa: isFirstUser,
      },
      env.JWT_SECRET,
    );
    setCookie(c, 'tv_session', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return c.json({
      token,
      user: {
        id: userId,
        email: user.email,
        displayName: user.displayName,
        globalRole: user.globalRole,
      },
      tenant: { id: tenantId, slug: tenant.slug, name: tenant.name, planCode: tenant.planCode },
    });
  })
  .post('/login', zValidator('json', LoginBody), async (c) => {
    const body = c.req.valid('json');
    const { user, tenant, member } = await db.transaction(async (txDb) => {
      const { withSuperAdminRls, clearRls } = await import('@tv/db');
      await withSuperAdminRls(txDb as never, 'system');
      try {
        const [u] = await txDb
          .select()
          .from(users)
          .where(eq(users.email, body.email.toLowerCase()))
          .limit(1);
        if (!u) throw new AuthError('Invalid credentials');
        const ok = await verifyPassword(u.passwordHash, body.password);
        if (!ok) throw new AuthError('Invalid credentials');
        const [row] = await txDb
          .select({ member: tenantMembers, tenant: tenants })
          .from(tenantMembers)
          .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
          .where(
            and(
              eq(tenantMembers.userId, u.id),
              body.tenantSlug ? eq(tenants.slug, body.tenantSlug) : undefined,
            ),
          )
          .limit(1);
        if (!row)
          throw new AuthError(
            body.tenantSlug ? 'Tenant not found for user' : 'No tenants for user',
          );
        if (row.tenant.status !== 'active') throw new AuthError('Tenant suspended');
        return { user: u, tenant: row.tenant, member: row.member };
      } finally {
        await clearRls(txDb as never);
      }
    });
    const token = await issueAccessToken(
      {
        sub: user.id,
        email: user.email,
        tid: member.tenantId as never,
        role: member.role,
        plan: tenant.planCode,
        sa: user.globalRole === 'super_admin',
      },
      env.JWT_SECRET,
    );
    setCookie(c, 'tv_session', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        globalRole: user.globalRole,
      },
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, planCode: tenant.planCode },
    });
  })
  .post('/logout', (c) => {
    deleteCookie(c, 'tv_session', { path: '/' });
    return c.json({ ok: true });
  })
  .get('/me', async (c) => {
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!token) return c.json({ user: null, reason: 'no_token' });
    try {
      const { verifyAccessToken } = await import('@tv/auth');
      const claims = await verifyAccessToken(token, env.JWT_SECRET);
      const [user] = await db.select().from(users).where(eq(users.id, claims.sub)).limit(1);
      if (!user) return c.json({ user: null, reason: 'no_user', claims });
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, claims.tid)).limit(1);
      return c.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          globalRole: user.globalRole,
        },
        tenant: tenant
          ? { id: tenant.id, slug: tenant.slug, name: tenant.name, planCode: tenant.planCode }
          : null,
        claims,
      });
    } catch (e) {
      return c.json({
        user: null,
        reason: 'verify_failed',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
