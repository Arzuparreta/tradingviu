import { pgTable, text, timestamp, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { ulid } from 'ulid';
import { exchanges, symbols } from './symbols';
import { users, tenants } from './tenants';

const id = () => text('id').primaryKey().$defaultFn(() => ulid());
const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' }).$defaultFn(() => new Date()).notNull();

export const dataSubscriptions = pgTable(
  'data_subscriptions',
  {
    id: id(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    symbolId: text('symbol_id').notNull().references(() => symbols.id, { onDelete: 'cascade' }),
    intervals: jsonb('intervals').$type<string[]>().notNull().default([]),
    lastBarAt: timestamp('last_bar_at', { withTimezone: true, mode: 'date' }),
    realtimeEnabled: boolean('realtime_enabled').notNull().default(false),
    createdAt: ts('created_at'),
  },
  (t) => ({
    tenantSymbolIdx: uniqueIndex('data_subs_tenant_symbol_uq').on(t.tenantId, t.symbolId),
    tenantUserIdx: index('data_subs_tenant_user_idx').on(t.tenantId, t.userId),
  }),
);

export const providerHealth = pgTable(
  'provider_health',
  {
    id: id(),
    provider: text('provider').notNull(),
    status: text('status').notNull(),
    latencyMs: text('latency_ms'),
    rateRemaining: text('rate_remaining'),
    rateReset: timestamp('rate_reset', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    checkedAt: timestamp('checked_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    providerIdx: index('provider_health_provider_idx').on(t.provider),
  }),
);
