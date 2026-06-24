import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { TenantIdSchema, type TenantId } from './ids.js';

export const TenantRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type TenantRole = z.infer<typeof TenantRoleSchema>;

export const GlobalRoleSchema = z.enum(['super_admin', 'user']);
export type GlobalRole = z.infer<typeof GlobalRoleSchema>;

export interface TenantContext {
  readonly tenantId: TenantId;
  readonly userId: string;
  readonly tenantRole: TenantRole;
  readonly planCode: string;
  readonly isSuperAdmin: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

export const runWithTenant = <T>(ctx: TenantContext, fn: () => T): T =>
  storage.run(ctx, fn);

export const getTenant = (): TenantContext => {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('No tenant context. Wrap with runWithTenant().');
  return ctx;
};

export const tryGetTenant = (): TenantContext | undefined => storage.getStore();

export const requireTenant = (): TenantContext => getTenant();

export const setTenantForSession = async (
  pool: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  ctx: TenantContext,
): Promise<void> => {
  await pool.query(`SELECT set_config('app.tenant_id', $1, true)`, [ctx.tenantId]);
  await pool.query(`SELECT set_config('app.user_id', $1, true)`, [ctx.userId]);
  await pool.query(`SELECT set_config('app.is_super_admin', $1, true)`, [
    ctx.isSuperAdmin ? 'true' : 'false',
  ]);
};

export const TenantContextSchema = z.object({
  tenantId: TenantIdSchema,
  userId: z.string(),
  tenantRole: TenantRoleSchema,
  planCode: z.string(),
  isSuperAdmin: z.boolean(),
});
