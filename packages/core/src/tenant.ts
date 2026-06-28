import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';

/**
 * Single-user auth context. The platform is personal: one owner account, no
 * tenants, no roles, no RLS. The context carries just the authenticated user id.
 * (The `getTenant`/`TenantContext` names are kept to avoid churn across call
 * sites; there is no multi-tenancy.)
 */
export interface TenantContext {
  readonly userId: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

export const runWithTenant = <T>(ctx: TenantContext, fn: () => T): T => storage.run(ctx, fn);

export const getTenant = (): TenantContext => {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('No auth context. Wrap with runWithTenant().');
  return ctx;
};

export const tryGetTenant = (): TenantContext | undefined => storage.getStore();

export const requireTenant = (): TenantContext => getTenant();

export const TenantContextSchema = z.object({
  userId: z.string(),
});
