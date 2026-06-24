import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import type { Database } from '@tv/db';
import { subscriptions, plans, tenants } from '@tv/db/schema';
import { ulid } from 'ulid';
import { type TenantId, NotFoundError, ValidationError } from '@tv/core';
import { invalidatePlanCache } from '@tv/quotas';

let _stripe: Stripe | undefined;

export const getStripe = (): Stripe => {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY not set. Billing endpoints will reject.');
  }
  _stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion });
  return _stripe;
};

export const isBillingEnabled = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY);

export const getOrCreateCustomer = async (
  db: Database,
  tenantId: TenantId,
  email: string,
): Promise<string> => {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId));
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;
  const customer = await getStripe().customers.create({
    email,
    metadata: { tenantId },
  });
  if (sub) {
    await db
      .update(subscriptions)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(subscriptions.tenantId, tenantId));
  } else {
    await db.insert(subscriptions).values({
      id: ulid(),
      tenantId,
      planCode: 'free',
      stripeCustomerId: customer.id,
      status: 'active',
    });
  }
  return customer.id;
};

export const createCheckoutSession = async (db: Database, args: {
  tenantId: TenantId;
  email: string;
  planCode: string;
  cycle: 'monthly' | 'yearly';
  returnUrl: string;
}) => {
  if (!isBillingEnabled()) throw new ValidationError('Billing not configured');
  const [plan] = await db.select().from(plans).where(eq(plans.code, args.planCode));
  if (!plan) throw new NotFoundError('Plan not found', { planCode: args.planCode });
  const priceId =
    args.cycle === 'yearly' ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  if (!priceId) {
    throw new ValidationError('Plan has no Stripe price for this cycle', { planCode: args.planCode, cycle: args.cycle });
  }
  const customerId = await getOrCreateCustomer(db, args.tenantId, args.email);
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${args.returnUrl}?checkout=success`,
    cancel_url: `${args.returnUrl}?checkout=cancel`,
    metadata: { tenantId: args.tenantId, planCode: args.planCode },
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return session.url;
};

export const createPortalSession = async (db: Database, args: {
  tenantId: TenantId;
  returnUrl: string;
}) => {
  if (!isBillingEnabled()) throw new ValidationError('Billing not configured');
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, args.tenantId));
  if (!sub?.stripeCustomerId) throw new NotFoundError('No Stripe customer for tenant');
  const portal = await getStripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: args.returnUrl,
  });
  return portal.url;
};

export const applySubscriptionChange = async (
  db: Database,
  args: {
    tenantId: TenantId;
    planCode: string;
    status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
    billingCycle: 'monthly' | 'yearly';
    currentPeriodEnd: Date;
    stripeSubscriptionId?: string;
  },
): Promise<void> => {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, args.tenantId));

  if (existing) {
    await db
      .update(subscriptions)
      .set({
        planCode: args.planCode,
        status: args.status,
        billingCycle: args.billingCycle,
        currentPeriodEnd: args.currentPeriodEnd,
        stripeSubscriptionId: args.stripeSubscriptionId ?? existing.stripeSubscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.tenantId, args.tenantId));
  } else {
    await db.insert(subscriptions).values({
      id: ulid(),
      tenantId: args.tenantId,
      planCode: args.planCode,
      status: args.status,
      billingCycle: args.billingCycle,
      currentPeriodEnd: args.currentPeriodEnd,
      ...(args.stripeSubscriptionId ? { stripeSubscriptionId: args.stripeSubscriptionId } : {}),
    });
  }

  await db
    .update(tenants)
    .set({ planCode: args.planCode, updatedAt: new Date() })
    .where(eq(tenants.id, args.tenantId));

  invalidatePlanCache(args.planCode);
  invalidatePlanCache('free');
};
