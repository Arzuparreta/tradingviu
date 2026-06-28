import { afterEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { inArray } from 'drizzle-orm';
import { createDb } from '@tv/db';
import { users } from '@tv/db/schema';
import { ensureOwner } from '@tv/auth';
import { loadEnv } from '@tv/core';
import { authRoutes } from './auth.js';
import { errorHandler } from '../middleware/error.js';

const app = new Hono();
app.onError(errorHandler);
app.route('/auth', authRoutes);

const postJson = async (path: string, body: unknown): Promise<Response> =>
  await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const db = createDb({ url: loadEnv().DATABASE_URL });
let cleanupEmails: string[] = [];

const rememberUser = (email: string): string => {
  cleanupEmails.push(email.toLowerCase());
  return email;
};

afterEach(async () => {
  if (cleanupEmails.length === 0) return;
  await db.delete(users).where(inArray(users.email, cleanupEmails));
  cleanupEmails = [];
});

describe('auth routes integration', () => {
  test('an existing owner account can log in with normalized email input', async () => {
    const unique = Date.now().toString(36);
    const email = rememberUser(`auth-login-${unique}@example.com`);
    const password = 'CorrectHorse123!';

    await ensureOwner(db, { email, password, displayName: 'Owner' });

    const login = await postJson('/auth/login', {
      email: `  ${email.toUpperCase()}  `,
      password,
    });
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as {
      token: string;
      user: { email: string };
    };
    expect(loginBody.token.length).toBeGreaterThan(20);
    expect(loginBody.user.email).toBe(email);
  });

  test('signup is limited to creating the single owner account', async () => {
    const unique = Date.now().toString(36);
    await ensureOwner(db, {
      email: rememberUser(`existing-owner-${unique}@example.com`),
      password: 'CorrectHorse123!',
    });

    const signup = await postJson('/auth/signup', {
      email: rememberUser(`another-owner-${unique}@example.com`),
      password: 'CorrectHorse123!',
    });
    expect(signup.status).toBe(409);
    const body = (await signup.json()) as { error: { message: string } };
    expect(body.error.message).toBe('A user account already exists');
  });

  test('me restores the browser session from the session cookie', async () => {
    const unique = Date.now().toString(36);
    const email = rememberUser(`cookie-session-${unique}@example.com`);
    const password = 'CorrectHorse123!';
    await ensureOwner(db, { email, password });

    const login = await postJson('/auth/login', { email, password });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toStartWith('tv_session=');

    const me = await app.request('/auth/me', {
      headers: { cookie: cookie ?? '' },
    });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { user: { email: string } | null };
    expect(body.user?.email).toBe(email);
  });

  test('seeded owner credentials are repaired for an existing account before login', async () => {
    const unique = Date.now().toString(36);
    const email = rememberUser(`seeded-owner-${unique}@example.com`);
    const oldPassword = 'OldOwnerPassword123!';
    const newPassword = 'NewOwnerPassword123!';

    const created = await ensureOwner(db, { email, password: oldPassword, displayName: 'Owner' });
    expect(created.created).toBe(true);
    expect(created.passwordUpdated).toBe(false);

    const repaired = await ensureOwner(db, {
      email: `  ${email.toUpperCase()}  `,
      password: newPassword,
    });
    expect(repaired.created).toBe(false);
    expect(repaired.passwordUpdated).toBe(true);

    const staleLogin = await postJson('/auth/login', { email, password: oldPassword });
    expect(staleLogin.status).toBe(401);

    const login = await postJson('/auth/login', {
      email: `  ${email.toUpperCase()}  `,
      password: newPassword,
    });
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as {
      token: string;
      user: { email: string };
    };
    expect(loginBody.token.length).toBeGreaterThan(20);
    expect(loginBody.user.email).toBe(email);
  });

  test('development owner login bootstraps the configured owner without a typed password', async () => {
    const unique = Date.now().toString(36);
    process.env.OWNER_EMAIL = rememberUser(`dev-owner-${unique}@example.com`);
    process.env.OWNER_PASSWORD = 'DevOwnerPassword123!';

    const login = await postJson('/auth/dev-owner', {});
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as {
      token: string;
      user: { email: string; displayName: string };
    };
    expect(loginBody.token.length).toBeGreaterThan(20);
    expect(loginBody.user.email).toBe(process.env.OWNER_EMAIL);
    expect(loginBody.user.displayName).toBe('Owner');
  });

  test('invalid credentials stay rejected even when development owner login is configured', async () => {
    const unique = Date.now().toString(36);
    process.env.OWNER_EMAIL = rememberUser(`form-owner-${unique}@example.com`);
    process.env.OWNER_PASSWORD = 'FormOwnerPassword123!';

    const login = await postJson('/auth/login', {
      email: process.env.OWNER_EMAIL,
      password: 'whatever-was-typed',
    });
    expect(login.status).toBe(401);

    await ensureOwner(db, {
      email: rememberUser(`normal-login-failure-${unique}@example.com`),
      password: 'CorrectHorse123!',
    });
    const fallbackLogin = await postJson('/auth/login', {
      email: `normal-login-failure-${unique}@example.com`,
      password: 'wrong',
    });
    expect(fallbackLogin.status).toBe(401);
  });
});
