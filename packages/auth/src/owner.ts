import { eq } from 'drizzle-orm';
import { users } from '@tv/db/schema';
import type { Database } from '@tv/db';
import { newUserId, type UserId } from '@tv/core';
import { hashPassword, verifyPassword } from './password.js';
import { normalizeEmail } from './email.js';

export interface EnsureOwnerInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface EnsureOwnerResult {
  userId: UserId;
  email: string;
  created: boolean;
  passwordUpdated: boolean;
}

/**
 * Idempotent local/self-host bootstrap for the personal owner account.
 * If the account exists but the configured password no longer matches, repair
 * the hash so `db:seed` can recover a broken login without manual SQL.
 */
export const ensureOwner = async (
  db: Database,
  input: EnsureOwnerInput,
): Promise<EnsureOwnerResult> => {
  const email = normalizeEmail(input.email);
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!existing) {
    const userId = newUserId();
    await db.insert(users).values({
      id: userId,
      email,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName ?? null,
    });
    return { userId, email, created: true, passwordUpdated: false };
  }

  const passwordMatches = await verifyPassword(existing.passwordHash, input.password);
  if (passwordMatches) {
    return { userId: existing.id as UserId, email, created: false, passwordUpdated: false };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName ?? existing.displayName,
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing.id));

  return { userId: existing.id as UserId, email, created: false, passwordUpdated: true };
};
