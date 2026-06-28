import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createDb } from '@tv/db';
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

describe('auth routes integration', () => {
  test('an existing signed-up account can log in with normalized email input', async () => {
    const unique = Date.now().toString(36);
    const email = `auth-login-${unique}@example.com`;
    const password = 'CorrectHorse123!';

    const signup = await postJson('/auth/signup', {
      email: `  ${email.toUpperCase()}  `,
      password,
    });
    expect(signup.status).toBe(200);
    const signupBody = (await signup.json()) as { user: { email: string } };
    expect(signupBody.user.email).toBe(email);

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

  test('seeded owner credentials are repaired for an existing account before login', async () => {
    const db = createDb({ url: loadEnv().DATABASE_URL });
    const unique = Date.now().toString(36);
    const email = `seeded-owner-${unique}@example.com`;
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
});
