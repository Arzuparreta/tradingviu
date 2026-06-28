import { pgTable, text, timestamp, jsonb, boolean, bigint, doublePrecision, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { ulid } from 'ulid';
import { exchanges, symbols } from './symbols';
import { users } from './tenants';

const id = () => text('id').primaryKey().$defaultFn(() => ulid());
const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' }).$defaultFn(() => new Date()).notNull();

export const dataSubscriptions = pgTable(
  'data_subscriptions',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    symbolId: text('symbol_id').notNull().references(() => symbols.id, { onDelete: 'cascade' }),
    intervals: jsonb('intervals').$type<string[]>().notNull().default([]),
    lastBarAt: timestamp('last_bar_at', { withTimezone: true, mode: 'date' }),
    realtimeEnabled: boolean('realtime_enabled').notNull().default(false),
    createdAt: ts('created_at'),
  },
  (t) => ({
    tenantSymbolIdx: uniqueIndex('data_subs_tenant_symbol_uq').on(t.symbolId),
    tenantUserIdx: index('data_subs_tenant_user_idx').on(t.userId),
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

export const bars = pgTable(
  'bars',
  {
    provider: text('provider').notNull(),
    ticker: text('ticker').notNull(),
    interval: text('interval').notNull(),
    time: bigint('time', { mode: 'number' }).notNull(),
    open: doublePrecision('open').notNull(),
    high: doublePrecision('high').notNull(),
    low: doublePrecision('low').notNull(),
    close: doublePrecision('close').notNull(),
    volume: doublePrecision('volume').notNull().default(0),
    trades: bigint('trades', { mode: 'number' }),
    isClosed: boolean('is_closed').notNull().default(true),
    insertedAt: timestamp('inserted_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.ticker, t.interval, t.time] }),
    lookupIdx: index('bars_lookup_idx').on(t.provider, t.ticker, t.interval, t.time),
  }),
);

export type BarRow = typeof bars.$inferSelect;
export type NewBarRow = typeof bars.$inferInsert;
