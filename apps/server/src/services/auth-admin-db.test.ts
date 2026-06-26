import { describe, expect, test } from 'bun:test';
import { resolveAuthAdminDatabaseUrl } from './auth-admin-db.js';

const runtimeUrl = 'postgresql://tv_app:change-me-app@localhost:5434/tradingviu';
const adminUrl = 'postgresql://tradingviu:change-me@localhost:5434/tradingviu';

describe('resolveAuthAdminDatabaseUrl', () => {
  test('requires an explicit admin URL for auth bootstrap', () => {
    expect(() =>
      resolveAuthAdminDatabaseUrl({ DATABASE_URL: runtimeUrl }),
    ).toThrow(/DATABASE_URL_ADMIN is required/);
  });

  test('rejects silently reusing the runtime RLS role for auth bootstrap', () => {
    expect(() =>
      resolveAuthAdminDatabaseUrl({ DATABASE_URL: runtimeUrl, DATABASE_URL_ADMIN: runtimeUrl }),
    ).toThrow(/admin Postgres role/);
    expect(() =>
      resolveAuthAdminDatabaseUrl({
        DATABASE_URL: adminUrl,
        DATABASE_URL_ADMIN: runtimeUrl,
      }),
    ).toThrow(/admin Postgres role/);
  });

  test('accepts a distinct admin URL', () => {
    expect(resolveAuthAdminDatabaseUrl({ DATABASE_URL: runtimeUrl, DATABASE_URL_ADMIN: adminUrl })).toBe(adminUrl);
  });
});
