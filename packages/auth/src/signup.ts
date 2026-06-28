import { eq, sql } from 'drizzle-orm';
import { users } from '@tv/db/schema';
import type { Database } from '@tv/db';
import { newUserId, type UserId } from '@tv/core';
import { hashPassword } from './password.js';
import { normalizeEmail } from './email.js';
import { ConflictError } from '@tv/core';

export interface SignupInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface SignupResult {
  userId: UserId;
  isFirstUser: boolean;
}

/**
 * Create the owner account. Single-user platform: the first signup creates the
 * owner; there is no tenant or membership to provision.
 */
export const signup = async (db: Database, input: SignupInput): Promise<SignupResult> => {
  const email = normalizeEmail(input.email);
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new ConflictError('Email already registered', { email });
  }

  const passwordHash = await hashPassword(input.password);
  const userId = newUserId();

  const result = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text AS count FROM users`,
  );
  const isFirstUser = parseInt(result[0]?.count ?? '0', 10) === 0;

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    displayName: input.displayName ?? null,
  });

  return { userId, isFirstUser };
};
