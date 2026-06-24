import { sql } from 'drizzle-orm';
import type { TenantContext } from '@tv/core';
import type { Database } from './client.js';

export const withTenantRls = async (db: Database, ctx: TenantContext): Promise<void> => {
  await db.execute(sql`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`);
  await db.execute(sql`SELECT set_config('app.user_id', ${ctx.userId}, true)`);
  await db.execute(sql`SELECT set_config('app.is_super_admin', ${ctx.isSuperAdmin ? 'true' : 'false'}, true)`);
};

export const withSuperAdminRls = async (db: Database, userId: string): Promise<void> => {
  await db.execute(sql`SELECT set_config('app.is_super_admin', 'true', true)`);
  await db.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
};

export const clearRls = async (db: Database): Promise<void> => {
  await db.execute(sql`SELECT set_config('app.tenant_id', '', false)`);
  await db.execute(sql`SELECT set_config('app.user_id', '', false)`);
  await db.execute(sql`SELECT set_config('app.is_super_admin', 'false', true)`);
};
