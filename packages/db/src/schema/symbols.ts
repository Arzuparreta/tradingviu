import { pgTable, text, timestamp, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { ulid } from 'ulid';

const id = () => text('id').primaryKey().$defaultFn(() => ulid());
const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' }).$defaultFn(() => new Date()).notNull();

export const exchanges = pgTable(
  'exchanges',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    country: text('country'),
    type: text('type').notNull(),
    url: text('url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts('created_at'),
  },
  (t) => ({
    codeIdx: uniqueIndex('exchanges_code_uq').on(t.code),
  }),
);

export const symbols = pgTable(
  'symbols',
  {
    id: id(),
    exchangeId: text('exchange_id')
      .notNull()
      .references(() => exchanges.id, { onDelete: 'cascade' }),
    ticker: text('ticker').notNull(),
    name: text('name').notNull(),
    assetClass: text('asset_class').notNull(),
    currency: text('currency').notNull().default('USD'),
    baseCurrency: text('base_currency'),
    quoteCurrency: text('quote_currency'),
    country: text('country'),
    sector: text('sector'),
    industry: text('industry'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    active: boolean('active').notNull().default(true),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    exchangeTickerIdx: uniqueIndex('symbols_exchange_ticker_uq').on(t.exchangeId, t.ticker),
    assetClassIdx: index('symbols_asset_class_idx').on(t.assetClass),
    nameIdx: index('symbols_name_idx').on(t.name),
  }),
);

export const symbolAliases = pgTable(
  'symbol_aliases',
  {
    id: id(),
    symbolId: text('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    source: text('source').notNull().default('manual'),
  },
  (t) => ({
    aliasIdx: uniqueIndex('symbol_aliases_alias_uq').on(t.alias, t.source),
    symbolIdx: index('symbol_aliases_symbol_idx').on(t.symbolId),
  }),
);

export type Exchange = typeof exchanges.$inferSelect;
export type Symbol = typeof symbols.$inferSelect;
export type NewSymbol = typeof symbols.$inferInsert;
export type SymbolAlias = typeof symbolAliases.$inferSelect;
