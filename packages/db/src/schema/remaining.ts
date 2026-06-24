import {
  pgTable,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
  integer,
  uniqueIndex,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { ulid } from 'ulid';
import { tenants, users } from './tenants';
import { symbols } from './symbols';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => ulid());
const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' })
    .$defaultFn(() => new Date())
    .notNull();

export const layouts = pgTable(
  'layouts',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    config: jsonb('config').$type<unknown>().notNull(),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantUserIdx: index('layouts_tenant_user_idx').on(t.tenantId, t.userId),
  }),
);

export const drawings = pgTable(
  'drawings',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbolId: text('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    interval: text('interval').notNull(),
    kind: text('kind').notNull(),
    geometry: jsonb('geometry').$type<unknown>().notNull(),
    style: jsonb('style').$type<Record<string, unknown>>(),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantSymbolIdx: index('drawings_tenant_symbol_idx').on(t.tenantId, t.symbolId),
  }),
);

export const alerts = pgTable(
  'alerts',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbolId: text('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    condition: jsonb('condition').$type<unknown>().notNull(),
    channels: jsonb('channels').$type<string[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    lastFiredAt: timestamp('last_fired_at', { withTimezone: true, mode: 'date' }),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantUserIdx: index('alerts_tenant_user_idx').on(t.tenantId, t.userId),
    symbolIdx: index('alerts_symbol_idx').on(t.symbolId),
    activeIdx: index('alerts_active_idx').on(t.active),
  }),
);

export const alertHistory = pgTable(
  'alert_history',
  {
    id: id(),
    alertId: text('alert_id')
      .notNull()
      .references(() => alerts.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    firedAt: timestamp('fired_at', { withTimezone: true, mode: 'date' }).notNull(),
    price: text('price'),
    payload: jsonb('payload').$type<unknown>(),
    delivered: jsonb('delivered').$type<Record<string, boolean>>().notNull().default({}),
  },
  (t) => ({
    alertIdx: index('alert_history_alert_idx').on(t.alertId),
    tenantIdx: index('alert_history_tenant_idx').on(t.tenantId),
  }),
);

export const screenerPresets = pgTable(
  'screener_presets',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    assetClass: text('asset_class').notNull(),
    query: jsonb('query').$type<unknown>().notNull(),
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantUserIdx: index('screener_tenant_user_idx').on(t.tenantId, t.userId),
  }),
);

export const userIndicators = pgTable(
  'user_indicators',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    source: text('source'),
    compiled: jsonb('compiled').$type<unknown>(),
    visibility: text('visibility').notNull().default('private'),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantUserIdx: index('user_indicators_tenant_user_idx').on(t.tenantId, t.userId),
  }),
);

export const backtests = pgTable(
  'backtests',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    symbolId: text('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    interval: text('interval').notNull(),
    fromAt: timestamp('from_at', { withTimezone: true, mode: 'date' }).notNull(),
    toAt: timestamp('to_at', { withTimezone: true, mode: 'date' }).notNull(),
    script: text('script').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('pending'),
    metrics: jsonb('metrics').$type<Record<string, number>>(),
    trades: jsonb('trades').$type<unknown[]>(),
    createdAt: ts('created_at'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    tenantUserIdx: index('backtests_tenant_user_idx').on(t.tenantId, t.userId),
  }),
);

export const ideas = pgTable(
  'ideas',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbolId: text('symbol_id').references(() => symbols.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    body: text('body'),
    snapshotUrl: text('snapshot_url'),
    direction: text('direction'),
    visibility: text('visibility').notNull().default('public'),
    likesCount: integer('likes_count').notNull().default(0),
    commentsCount: integer('comments_count').notNull().default(0),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantIdx: index('ideas_tenant_idx').on(t.tenantId, t.createdAt),
    userIdx: index('ideas_user_idx').on(t.userId),
  }),
);

export const comments = pgTable(
  'comments',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    parentId: text('parent_id'),
    body: text('body').notNull(),
    createdAt: ts('created_at'),
  },
  (t) => ({
    targetIdx: index('comments_target_idx').on(t.targetType, t.targetId),
  }),
);

export const likes = pgTable(
  'likes',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    createdAt: ts('created_at'),
  },
  (t) => ({
    targetIdx: index('likes_target_idx').on(t.targetType, t.targetId),
    userTargetUq: uniqueIndex('likes_user_target_uq').on(t.userId, t.targetType, t.targetId),
  }),
);

export const follows = pgTable(
  'follows',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    followerId: text('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followedId: text('followed_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at'),
  },
  (t) => ({
    pairIdx: uniqueIndex('follows_pair_uq').on(t.followerId, t.followedId),
  }),
);

export const publishedScripts = pgTable(
  'published_scripts',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    source: text('source').notNull(),
    visibility: text('visibility').notNull().default('public'),
    license: text('license').notNull().default('AGPL-3.0'),
    priceCents: integer('price_cents').notNull().default(0),
    downloads: integer('downloads').notNull().default(0),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantIdx: index('published_scripts_tenant_idx').on(t.tenantId, t.createdAt),
    userIdx: index('published_scripts_user_idx').on(t.userId),
  }),
);

// Subscription channels: a creator-owned space (free or paid) whose posts are
// gated behind an active subscription or ownership.
export const spaces = pgTable(
  'spaces',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // public → listed in the tenant feed; private → unlisted (invite/id only)
    visibility: text('visibility').notNull().default('public'),
    priceCents: integer('price_cents').notNull().default(0),
    currency: text('currency').notNull().default('USD'),
    subscribersCount: integer('subscribers_count').notNull().default(0),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantIdx: index('spaces_tenant_idx').on(t.tenantId, t.createdAt),
    ownerIdx: index('spaces_owner_idx').on(t.ownerId),
  }),
);

export const spaceSubscriptions = pgTable(
  'space_subscriptions',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // active → entitled; canceled → kept for history, not entitled
    status: text('status').notNull().default('active'),
    priceCents: integer('price_cents').notNull().default(0),
    startedAt: ts('started_at'),
    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
    createdAt: ts('created_at'),
  },
  (t) => ({
    pairUq: uniqueIndex('space_subscriptions_pair_uq').on(t.spaceId, t.userId),
    spaceIdx: index('space_subscriptions_space_idx').on(t.spaceId),
    userIdx: index('space_subscriptions_user_idx').on(t.userId),
  }),
);

export const spacePosts = pgTable(
  'space_posts',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    body: text('body').notNull(),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    spaceIdx: index('space_posts_space_idx').on(t.spaceId, t.createdAt),
  }),
);

export const portfolios = pgTable(
  'portfolios',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    baseCurrency: text('base_currency').notNull().default('USD'),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantUserIdx: index('portfolios_tenant_user_idx').on(t.tenantId, t.userId),
  }),
);

export const holdings = pgTable(
  'holdings',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    portfolioId: text('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    symbolId: text('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    quantity: text('quantity').notNull(),
    avgCost: text('avg_cost'),
    openedAt: timestamp('opened_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    portfolioIdx: index('holdings_portfolio_idx').on(t.portfolioId),
  }),
);

export const transactions = pgTable(
  'transactions',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    portfolioId: text('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    symbolId: text('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    side: text('side').notNull(),
    quantity: text('quantity').notNull(),
    price: text('price').notNull(),
    fee: text('fee').notNull().default('0'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    note: text('note'),
  },
  (t) => ({
    portfolioIdx: index('transactions_portfolio_idx').on(t.portfolioId, t.occurredAt),
  }),
);

export const watchlists = pgTable(
  'watchlists',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantUserIdx: index('watchlists_tenant_user_idx').on(t.tenantId, t.userId),
  }),
);

export const watchlistItems = pgTable(
  'watchlist_items',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    watchlistId: text('watchlist_id')
      .notNull()
      .references(() => watchlists.id, { onDelete: 'cascade' }),
    symbolId: text('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    color: text('color'),
    note: text('note'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    watchlistSymbolIdx: uniqueIndex('watchlist_items_uq').on(t.watchlistId, t.symbolId),
  }),
);

export const paperAccounts = pgTable(
  'paper_accounts',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    balance: text('balance').notNull().default('100000'),
    currency: text('currency').notNull().default('USD'),
    leverage: text('leverage').notNull().default('1'),
    createdAt: ts('created_at'),
  },
  (t) => ({
    tenantUserIdx: index('paper_accounts_tenant_user_idx').on(t.tenantId, t.userId),
  }),
);

export const paperOrders = pgTable(
  'paper_orders',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => paperAccounts.id, { onDelete: 'cascade' }),
    symbolId: text('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    side: text('side').notNull(),
    type: text('type').notNull(),
    quantity: text('quantity').notNull(),
    price: text('price'),
    status: text('status').notNull().default('pending'),
    filledAt: timestamp('filled_at', { withTimezone: true, mode: 'date' }),
    fillPrice: text('fill_price'),
    fee: text('fee').notNull().default('0'),
    createdAt: ts('created_at'),
  },
  (t) => ({
    accountIdx: index('paper_orders_account_idx').on(t.accountId),
  }),
);

export const brokerConnections = pgTable(
  'broker_connections',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    broker: text('broker').notNull(),
    label: text('label'),
    accountId: text('account_id'),
    credentialsEncrypted: text('credentials_encrypted').notNull(),
    status: text('status').notNull().default('connected'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true, mode: 'date' }),
    createdAt: ts('created_at'),
  },
  (t) => ({
    tenantUserIdx: index('broker_connections_tenant_user_idx').on(t.tenantId, t.userId),
  }),
);

export const newsArticles = pgTable(
  'news_articles',
  {
    id: id(),
    source: text('source').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    symbols: jsonb('symbols').$type<string[]>().notNull().default([]),
    sentiment: text('sentiment'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }).notNull(),
    fetchedAt: ts('fetched_at'),
  },
  (t) => ({
    urlIdx: uniqueIndex('news_articles_url_uq').on(t.url),
    publishedIdx: index('news_articles_published_idx').on(t.publishedAt),
  }),
);

export const earningsCalendar = pgTable(
  'earnings_calendar',
  {
    id: id(),
    symbolId: text('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true, mode: 'date' }).notNull(),
    epsEstimate: text('eps_estimate'),
    epsActual: text('eps_actual'),
    revenueEstimate: text('revenue_estimate'),
    revenueActual: text('revenue_actual'),
  },
  (t) => ({
    symbolDateIdx: uniqueIndex('earnings_symbol_date_uq').on(t.symbolId, t.date),
  }),
);

export const dividendCalendar = pgTable(
  'dividend_calendar',
  {
    id: id(),
    symbolId: text('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    exDate: timestamp('ex_date', { withTimezone: true, mode: 'date' }).notNull(),
    paymentDate: timestamp('payment_date', { withTimezone: true, mode: 'date' }),
    recordDate: timestamp('record_date', { withTimezone: true, mode: 'date' }),
    declarationDate: timestamp('declaration_date', { withTimezone: true, mode: 'date' }),
    amount: text('amount').notNull(),
    currency: text('currency').notNull().default('USD'),
    frequency: text('frequency'),
  },
  (t) => ({
    symbolExDateIdx: uniqueIndex('dividends_symbol_ex_date_uq').on(t.symbolId, t.exDate),
    exDateIdx: index('dividends_ex_date_idx').on(t.exDate),
  }),
);

export const economicEvents = pgTable(
  'economic_events',
  {
    id: id(),
    country: text('country').notNull(),
    eventAt: timestamp('event_at', { withTimezone: true, mode: 'date' }).notNull(),
    name: text('name').notNull(),
    importance: text('importance').notNull().default('low'),
    actual: text('actual'),
    forecast: text('forecast'),
    previous: text('previous'),
  },
  (t) => ({
    countryDateIdx: index('economic_events_country_date_idx').on(t.country, t.eventAt),
    countryEventNameUq: uniqueIndex('economic_events_country_event_name_uq').on(
      t.country,
      t.eventAt,
      t.name,
    ),
  }),
);

export const fundamentalSnapshots = pgTable(
  'fundamental_snapshots',
  {
    id: id(),
    symbolId: text('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    fiscalPeriod: text('fiscal_period').notNull().default('ttm'),
    periodEnd: timestamp('period_end', { withTimezone: true, mode: 'date' }).notNull(),
    source: text('source').notNull().default('manual'),
    currency: text('currency').notNull().default('USD'),
    isLatest: boolean('is_latest').notNull().default(true),
    marketCap: doublePrecision('market_cap'),
    peRatio: doublePrecision('pe_ratio'),
    eps: doublePrecision('eps'),
    revenue: doublePrecision('revenue'),
    dividendYield: doublePrecision('dividend_yield'),
    roe: doublePrecision('roe'),
    revenueGrowth: doublePrecision('revenue_growth'),
    earningsGrowth: doublePrecision('earnings_growth'),
    beta: doublePrecision('beta'),
    week52High: doublePrecision('week_52_high'),
    week52Low: doublePrecision('week_52_low'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    fetchedAt: ts('fetched_at'),
  },
  (t) => ({
    symbolPeriodIdx: index('fundamentals_symbol_period_idx').on(
      t.symbolId,
      t.fiscalPeriod,
      t.periodEnd,
    ),
    latestIdx: index('fundamentals_latest_idx').on(t.symbolId, t.fiscalPeriod, t.isLatest),
    uniqueSnapshot: uniqueIndex('fundamentals_symbol_period_end_uq').on(
      t.symbolId,
      t.fiscalPeriod,
      t.periodEnd,
    ),
  }),
);

export const yieldCurves = pgTable(
  'yield_curves',
  {
    id: id(),
    country: text('country').notNull(),
    curveDate: timestamp('curve_date', { withTimezone: true, mode: 'date' }).notNull(),
    tenorMonths: integer('tenor_months').notNull(),
    rate: doublePrecision('rate').notNull(),
    currency: text('currency').notNull().default('USD'),
    source: text('source').notNull().default('manual'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    countryDateIdx: index('yield_curves_country_date_idx').on(t.country, t.curveDate),
    pointUq: uniqueIndex('yield_curves_point_uq').on(
      t.country,
      t.curveDate,
      t.tenorMonths,
      t.source,
    ),
  }),
);

export const macroSeriesObservations = pgTable(
  'macro_series_observations',
  {
    id: id(),
    country: text('country').notNull(),
    metricCode: text('metric_code').notNull(),
    metricName: text('metric_name').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true, mode: 'date' }).notNull(),
    value: doublePrecision('value').notNull(),
    unit: text('unit').notNull(),
    frequency: text('frequency').notNull(),
    source: text('source').notNull().default('manual'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    countryMetricDateIdx: index('macro_series_country_metric_date_idx').on(
      t.country,
      t.metricCode,
      t.observedAt,
    ),
    pointUq: uniqueIndex('macro_series_point_uq').on(
      t.country,
      t.metricCode,
      t.observedAt,
      t.source,
    ),
  }),
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    tenantAtIdx: index('audit_log_tenant_at_idx').on(t.tenantId, t.at),
  }),
);
