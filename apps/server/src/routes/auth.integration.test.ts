import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
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
      tenantName: `Auth Login ${unique}`,
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
      tenant: { id: string };
    };
    expect(loginBody.token.length).toBeGreaterThan(20);
    expect(loginBody.user.email).toBe(email);
    expect(loginBody.tenant.id.length).toBeGreaterThan(0);
  });
});
