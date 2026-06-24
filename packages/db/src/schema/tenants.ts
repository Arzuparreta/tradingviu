import { pgTable, text, timestamp, boolean, jsonb, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';
import { ulid } from 'ulid';

const id = () => text('id').primaryKey().$defaultFn(() => ulid());
const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' }).$defaultFn(() => new Date()).notNull();

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'cancelled']);
export const tenantRoleEnum = pgEnum('tenant_role', ['owner', 'admin', 'member', 'viewer']);

export const tenants = pgTable(
  'tenants',
  {
    id: id(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    planCode: text('plan_code').notNull().default('free'),
    status: tenantStatusEnum('status').notNull().default('active'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    slugIdx: uniqueIndex('tenants_slug_uq').on(t.slug),
    statusIdx: index('tenants_status_idx').on(t.status),
  }),
);

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
    passwordHash: text('password_hash').notNull(),
    globalRole: text('global_role').notNull().default('user'),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    locale: text('locale').notNull().default('en'),
    timezone: text('timezone').notNull().default('UTC'),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaSecretEncrypted: text('mfa_secret_encrypted'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_uq').on(t.email),
  }),
);

export const tenantMembers = pgTable(
  'tenant_members',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: tenantRoleEnum('role').notNull().default('owner'),
    invitedAt: ts('invited_at'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    createdAt: ts('created_at'),
  },
  (t) => ({
    tenantUserIdx: uniqueIndex('tenant_members_tenant_user_uq').on(t.tenantId, t.userId),
    userIdx: index('tenant_members_user_idx').on(t.userId),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: ts('created_at'),
  },
  (t) => ({
    tokenIdx: uniqueIndex('sessions_token_uq').on(t.tokenHash),
    userIdx: index('sessions_user_idx').on(t.userId),
    expiresIdx: index('sessions_expires_idx').on(t.expiresAt),
  }),
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    label: text('label'),
    keyEncrypted: text('key_encrypted').notNull(),
    secretEncrypted: text('secret_encrypted'),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: ts('created_at'),
  },
  (t) => ({
    tenantProviderIdx: index('api_keys_tenant_provider_idx').on(t.tenantId, t.provider),
  }),
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type TenantMember = typeof tenantMembers.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
