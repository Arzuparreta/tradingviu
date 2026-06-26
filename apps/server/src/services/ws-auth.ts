import { and, eq } from 'drizzle-orm';
import { verifyAccessToken } from '@tv/auth';
import type { Database } from '@tv/db';
import { clearRls, withSuperAdminRls } from '@tv/db';
import { tenantMembers, tenants } from '@tv/db/schema';
import { AuthError } from '@tv/core';

export interface AuthenticatedWsData {
  userId: string;
  tenantId: string;
}

export const authenticateWsToken = async (
  db: Database,
  token: string,
  jwtSecret: string,
): Promise<AuthenticatedWsData> => {
  if (!token) throw new AuthError('Missing session token');
  const claims = await verifyAccessToken(token, jwtSecret);
  await db.transaction(async (txDb) => {
    await withSuperAdminRls(txDb as never, claims.sub);
    try {
      const [tenant] = await txDb.select().from(tenants).where(eq(tenants.id, claims.tid)).limit(1);
      if (!tenant) throw new AuthError('Tenant not found');
      if (tenant.status !== 'active') throw new AuthError('Tenant suspended');
      const [member] = await txDb
        .select({ id: tenantMembers.id })
        .from(tenantMembers)
        .where(and(eq(tenantMembers.userId, claims.sub), eq(tenantMembers.tenantId, claims.tid)))
        .limit(1);
      if (!member) throw new AuthError('Tenant membership missing');
    } finally {
      await clearRls(txDb as never);
    }
  });
  return { userId: claims.sub, tenantId: claims.tid };
};
