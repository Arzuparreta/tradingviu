import { eq, sql } from 'drizzle-orm';
import { tenants, users, tenantMembers, plans } from '@tv/db/schema';
import type { Database } from '@tv/db';
import { newUserId, newTenantId, type UserId, type TenantId } from '@tv/core';
import { hashPassword } from './password.js';
import { ulid } from 'ulid';
import { ConflictError, ValidationError } from '@tv/core';

export interface SignupInput {
  email: string;
  password: string;
  displayName?: string;
  tenantName?: string;
  tenantSlug?: string;
}

export interface SignupResult {
  userId: UserId;
  tenantId: TenantId;
  isFirstUser: boolean;
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 62) || 'user';

const ensureUniqueSlug = async (db: Database, base: string): Promise<string> => {
  let candidate = base;
  let i = 0;
  while (true) {
    const hit = await db.select().from(tenants).where(eq(tenants.slug, candidate)).limit(1);
    if (hit.length === 0) return candidate;
    i += 1;
    candidate = `${base}-${i}`;
    if (i > 100) throw new ValidationError('Could not generate unique tenant slug');
  }
};

export const signup = async (db: Database, input: SignupInput): Promise<SignupResult> => {
  // NOTE: caller MUST pass a connection that can bypass RLS (the admin role).
  // Signup inserts cross-tenant data (user + tenant + membership) before any
  // tenant context exists, so RLS would otherwise block the inserts.
  const email = input.email.toLowerCase().trim();
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new ConflictError('Email already registered', { email });
  }

  const passwordHash = await hashPassword(input.password);
  const userId = newUserId();
  const tenantId = newTenantId();

  const result = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text AS count FROM users`,
  );
  const isFirstUser = parseInt(result[0]?.count ?? '0', 10) === 0;

  const baseSlug = slugify(input.tenantSlug ?? input.tenantName ?? email.split('@')[0] ?? 'user');
  const slug = await ensureUniqueSlug(db, baseSlug);

  const plan = await db.select().from(plans).where(eq(plans.code, 'free')).limit(1);
  if (plan.length === 0) {
    throw new ValidationError('Free plan missing. Run `pnpm db:seed` first.');
  }

  // Caller MUST pass a connection that is wrapped in a transaction where the
  // session has super_admin RLS context (via withSuperAdminRls), so that
  // cross-tenant inserts (user, tenant, membership) succeed before any tenant
  // context exists.
  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    globalRole: isFirstUser ? 'super_admin' : 'user',
    displayName: input.displayName ?? null,
  });

  await db.insert(tenants).values({
    id: tenantId,
    slug,
    name: input.tenantName ?? `${input.displayName ?? email}'s workspace`,
    planCode: 'free',
  });

  await db.insert(tenantMembers).values({
    id: ulid(),
    tenantId,
    userId,
    role: 'owner',
    acceptedAt: new Date(),
  });

  return { userId, tenantId, isFirstUser };
};
