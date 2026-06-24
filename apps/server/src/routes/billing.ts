import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { plans, subscriptions, tenants } from '@tv/db/schema';
import { tryGetTenant, type TenantContext } from '@tv/core';
import { isBillingEnabled, createCheckoutSession, createPortalSession, applySubscriptionChange } from '@tv/billing';
import { getPlanQuotas } from '@tv/quotas';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type Stripe from 'stripe';

const CheckoutBody = z.object({
  planCode: z.string(),
  cycle: z.enum(['monthly', 'yearly']).default('monthly'),
});

export const billingRoutes = new Hono()
  .get('/billing/plans', async (c) => {
    const db = c.get('db');
    const rows = await db.select().from(plans).where(eq(plans.isPublic, true));
    rows.sort((a, b) => a.sortOrder - b.sortOrder);
    return c.json({ plans: rows });
  })
  .get('/billing/quotas', async (c) => {
    const tenant = tryGetTenant() as TenantContext;
    const db = c.get('db');
    const quotas = await getPlanQuotas(db, tenant.planCode);
    return c.json({ planCode: tenant.planCode, quotas });
  })
  .post('/billing/checkout', zValidator('json', CheckoutBody), async (c) => {
    const tenant = tryGetTenant() as TenantContext;
    const db = c.get('db');
    const body = c.req.valid('json');
    if (!isBillingEnabled()) return c.json({ error: 'billing_disabled' }, 503);
    const claims = c.get('claims') as { email: string };
    const url = await createCheckoutSession(db, {
      tenantId: tenant.tenantId,
      email: claims.email,
      planCode: body.planCode,
      cycle: body.cycle,
      returnUrl: process.env.STRIPE_PORTAL_RETURN_URL ?? 'http://localhost:5147/account/billing',
    });
    return c.json({ url });
  })
  .post('/billing/portal', async (c) => {
    const tenant = tryGetTenant() as TenantContext;
    const db = c.get('db');
    if (!isBillingEnabled()) return c.json({ error: 'billing_disabled' }, 503);
    const url = await createPortalSession(db, {
      tenantId: tenant.tenantId,
      returnUrl: process.env.STRIPE_PORTAL_RETURN_URL ?? 'http://localhost:5147/account/billing',
    });
    return c.json({ url });
  })
  .post('/webhooks/stripe', async (c) => {
    const sig = c.req.header('stripe-signature');
    if (!sig) return c.json({ error: 'missing signature' }, 400);
    const body = await c.req.text();
    const { getStripe } = await import('@tv/billing');
    const Stripe = (await import('stripe')).default;
    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (e) {
      return c.json({ error: 'invalid signature' }, 400);
    }
    const db = c.get('db');
    if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = (sub.metadata?.tenantId as string | undefined) ?? null;
      const planCode = (sub.metadata?.planCode as string | undefined) ?? 'free';
      if (tenantId) {
        await applySubscriptionChange(db, {
          tenantId: tenantId as never,
          planCode,
          status: sub.status as 'active',
          billingCycle: 'monthly',
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          stripeSubscriptionId: sub.id,
        });
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = (sub.metadata?.tenantId as string | undefined) ?? null;
      if (tenantId) {
        await applySubscriptionChange(db, {
          tenantId: tenantId as never,
          planCode: 'free',
          status: 'canceled',
          billingCycle: 'monthly',
          currentPeriodEnd: new Date(),
        });
      }
    }
    return c.json({ received: true });
  });
