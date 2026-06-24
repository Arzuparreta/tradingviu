import { pgTable, text, integer, timestamp, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { ulid } from 'ulid';
import { tenants } from './tenants';

const id = () => text('id').primaryKey().$defaultFn(() => ulid());
const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' }).$defaultFn(() => new Date()).notNull();

export const plans = pgTable(
  'plans',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    priceMonthlyCents: integer('price_monthly_cents').notNull().default(0),
    priceYearlyCents: integer('price_yearly_cents').notNull().default(0),
    currency: text('currency').notNull().default('EUR'),
    stripePriceIdMonthly: text('stripe_price_id_monthly'),
    stripePriceIdYearly: text('stripe_price_id_yearly'),
    quotas: jsonb('quotas').$type<PlanQuotas>().notNull(),
    features: jsonb('features').$type<string[]>().notNull().default([]),
    isDefault: boolean('is_default').notNull().default(false),
    isPublic: boolean('is_public').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    codeIdx: uniqueIndex('plans_code_uq').on(t.code),
  }),
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    planCode: text('plan_code').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    status: text('status').notNull().default('active'),
    billingCycle: text('billing_cycle').notNull().default('monthly'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true, mode: 'date' }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true, mode: 'date' }),
    cancelAt: timestamp('cancel_at', { withTimezone: true, mode: 'date' }),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantIdx: uniqueIndex('subscriptions_tenant_uq').on(t.tenantId),
    stripeSubIdx: uniqueIndex('subscriptions_stripe_sub_uq').on(t.stripeSubscriptionId),
  }),
);

export type PlanQuotas = {
  chartsPerTab: number;
  indicatorsPerChart: number;
  parallelConnections: number;
  priceAlerts: number;
  technicalAlerts: number;
  watchlistAlerts: number;
  historicalBars: number;
  watchlists: number;
  symbolsPerWatchlist: number;
  portfolios: number;
  holdingsPerPortfolio: number;
  savedLayouts: number;
  screenerAutoRefreshSeconds: number;
  indicatorOnIndicator: number;
  customIndicatorTemplates: number;
  secondBasedIntervals: boolean;
  tickBasedIntervals: boolean;
  customFormulas: boolean;
  volumeFootprint: boolean;
  tpo: boolean;
  autoChartPatterns: boolean;
  webhookNotifications: boolean;
  multiConditionAlerts: boolean;
  publishInviteOnlyScripts: boolean;
  publishProtectedScripts: boolean;
  adFree: boolean;
  prioritySupport: boolean;
};

export const DEFAULT_FREE_QUOTAS: PlanQuotas = {
  chartsPerTab: 1,
  indicatorsPerChart: 2,
  parallelConnections: 2,
  priceAlerts: 3,
  technicalAlerts: 0,
  watchlistAlerts: 0,
  historicalBars: 5_000,
  watchlists: 1,
  symbolsPerWatchlist: 30,
  portfolios: 1,
  holdingsPerPortfolio: 20,
  savedLayouts: 1,
  screenerAutoRefreshSeconds: 60,
  indicatorOnIndicator: 1,
  customIndicatorTemplates: 0,
  secondBasedIntervals: false,
  tickBasedIntervals: false,
  customFormulas: false,
  volumeFootprint: false,
  tpo: false,
  autoChartPatterns: false,
  webhookNotifications: false,
  multiConditionAlerts: false,
  publishInviteOnlyScripts: false,
  publishProtectedScripts: false,
  adFree: true,
  prioritySupport: false,
};

export const UNLIMITED_QUOTAS: PlanQuotas = {
  chartsPerTab: 16,
  indicatorsPerChart: 50,
  parallelConnections: 200,
  priceAlerts: 1_000,
  technicalAlerts: 1_000,
  watchlistAlerts: 15,
  historicalBars: 40_000,
  watchlists: 999,
  symbolsPerWatchlist: 1_000,
  portfolios: 7,
  holdingsPerPortfolio: 150,
  savedLayouts: 999,
  screenerAutoRefreshSeconds: 10,
  indicatorOnIndicator: 49,
  customIndicatorTemplates: 999,
  secondBasedIntervals: true,
  tickBasedIntervals: true,
  customFormulas: true,
  volumeFootprint: true,
  tpo: true,
  autoChartPatterns: true,
  webhookNotifications: true,
  multiConditionAlerts: true,
  publishInviteOnlyScripts: true,
  publishProtectedScripts: true,
  adFree: true,
  prioritySupport: true,
};

export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
