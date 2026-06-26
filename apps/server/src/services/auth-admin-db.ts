import type { Env } from '@tv/core';

type AuthDbEnv = Pick<Env, 'DATABASE_URL' | 'DATABASE_URL_ADMIN'>;

const usernameFromUrl = (url: string): string => {
  try {
    return new URL(url).username;
  } catch {
    return '';
  }
};

export const resolveAuthAdminDatabaseUrl = (env: AuthDbEnv): string => {
  const adminUrl = env.DATABASE_URL_ADMIN;
  if (!adminUrl) {
    throw new Error(
      'DATABASE_URL_ADMIN is required for auth bootstrap. Auth must not use DATABASE_URL because the runtime tv_app role is RLS-enforced.',
    );
  }
  if (adminUrl === env.DATABASE_URL || usernameFromUrl(adminUrl) === 'tv_app') {
    throw new Error(
      'DATABASE_URL_ADMIN must use the admin Postgres role, not the runtime tv_app role.',
    );
  }
  return adminUrl;
};
