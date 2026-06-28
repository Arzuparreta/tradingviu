import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { createDb } from '@tv/db';
import { users } from '@tv/db/schema';
import {
  signup,
  ensureOwner,
  issueAccessToken,
  verifyPassword,
  normalizeEmail,
  verifyAccessToken,
} from '@tv/auth';
import { loadEnv, AuthError, ForbiddenError } from '@tv/core';

const env = loadEnv();
const db = createDb({ url: env.DATABASE_URL });

const EmailSchema = z.string().transform(normalizeEmail).pipe(z.string().email());

const SignupBody = z.object({
  email: EmailSchema,
  password: z.string().min(10).max(200),
  displayName: z.string().min(1).max(80).optional(),
});

const LoginBody = z.object({
  email: EmailSchema,
  password: z.string().min(1),
});

const userPayload = (u: { id: string; email: string; displayName: string | null }) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
});

const jsonSession = async (
  c: Context,
  user: { id: string; email: string; displayName: string | null },
) => {
  const token = await issueAccessToken({ sub: user.id, email: user.email }, env.JWT_SECRET);
  setCookie(c, 'tv_session', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return c.json({ token, user: userPayload(user) });
};

const getDevelopmentOwnerUser = async () => {
  if (env.NODE_ENV === 'production') {
    throw new ForbiddenError('Development owner login is disabled');
  }
  const password = process.env.OWNER_PASSWORD;
  if (!password) throw new AuthError('OWNER_PASSWORD is not configured');
  const owner = await ensureOwner(db, {
    email: process.env.OWNER_EMAIL ?? 'owner@tradingviu.local',
    password,
    displayName: 'Owner',
  });
  const [user] = await db.select().from(users).where(eq(users.id, owner.userId)).limit(1);
  if (!user) throw new AuthError('Owner not found after bootstrap');
  return user;
};

export const authRoutes = new Hono()
  .post('/signup', zValidator('json', SignupBody), async (c) => {
    const body = c.req.valid('json');
    const cleanBody: { email: string; password: string; displayName?: string } = {
      email: body.email,
      password: body.password,
    };
    if (body.displayName) cleanBody.displayName = body.displayName;
    const { userId } = await signup(db, cleanBody);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new AuthError('User not found after signup');
    return jsonSession(c, user);
  })
  .post('/login', zValidator('json', LoginBody), async (c) => {
    const body = c.req.valid('json');
    const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user) throw new AuthError('Invalid credentials');
    const ok = await verifyPassword(user.passwordHash, body.password);
    if (!ok) throw new AuthError('Invalid credentials');
    return jsonSession(c, user);
  })
  .post('/dev-owner', async (c) => {
    return jsonSession(c, await getDevelopmentOwnerUser());
  })
  .post('/logout', (c) => {
    deleteCookie(c, 'tv_session', { path: '/' });
    return c.json({ ok: true });
  })
  .get('/me', async (c) => {
    const token =
      c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? getCookie(c, 'tv_session') ?? '';
    if (!token) return c.json({ user: null, reason: 'no_token' });
    try {
      const claims = await verifyAccessToken(token, env.JWT_SECRET);
      const [user] = await db.select().from(users).where(eq(users.id, claims.sub)).limit(1);
      if (!user) return c.json({ user: null, reason: 'no_user', claims });
      return c.json({ user: userPayload(user), claims });
    } catch (e) {
      return c.json({
        user: null,
        reason: 'verify_failed',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
