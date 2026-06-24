import { eq } from 'drizzle-orm';
import type { Database } from '@tv/db';
import { plans, type PlanQuotas } from '@tv/db/schema';
import { QuotaExceededError, type TenantId } from '@tv/core';
import { sql } from 'drizzle-orm';

const PLAN_CACHE_TTL_MS = 30_000;

const planCache = new Map<string, { quotas: PlanQuotas; ts: number }>();

export const getPlanQuotas = async (db: Database, planCode: string): Promise<PlanQuotas> => {
  const hit = planCache.get(planCode);
  if (hit && Date.now() - hit.ts < PLAN_CACHE_TTL_MS) return hit.quotas;

  const rows = await db.select().from(plans).where(eq(plans.code, planCode)).limit(1);
  if (rows.length === 0) {
    const free = await db.select().from(plans).where(eq(plans.code, 'free')).limit(1);
    if (free.length === 0) {
      throw new Error('No plans seeded. Run `pnpm db:seed`.');
    }
    planCache.set('free', { quotas: free[0]!.quotas, ts: Date.now() });
    return free[0]!.quotas;
  }
  planCache.set(planCode, { quotas: rows[0]!.quotas, ts: Date.now() });
  return rows[0]!.quotas;
};

export const invalidatePlanCache = (planCode?: string) => {
  if (planCode) planCache.delete(planCode);
  else planCache.clear();
};

export const countRows = async (
  db: Database,
  tableName: string,
  tenantId: TenantId,
): Promise<number> => {
  const query = sql`SELECT COUNT(*)::int AS c FROM ${sql.raw(tableName)} WHERE tenant_id = ${tenantId}`;
  const r = await db.execute<{ c: number }>(query);
  return r[0]?.c ?? 0;
};

export const checkQuota = async <K extends keyof PlanQuotas>(
  db: Database,
  planCode: string,
  key: K,
  current: number,
  options: { hardLimit?: number } = {},
): Promise<void> => {
  const quotas = await getPlanQuotas(db, planCode);
  const limit = quotas[key] as number;
  const cap = options.hardLimit ?? limit;
  if (current >= cap) {
    throw new QuotaExceededError(`Quota exceeded for ${String(key)}: ${current}/${cap}`, {
      key: String(key),
      current,
      limit: cap,
      planCode,
    });
  }
};

export const isFeatureEnabled = async (
  db: Database,
  planCode: string,
  key: keyof PlanQuotas,
): Promise<boolean> => {
  const quotas = await getPlanQuotas(db, planCode);
  return Boolean(quotas[key]);
};
