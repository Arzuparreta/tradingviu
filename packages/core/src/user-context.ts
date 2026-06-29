import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';

/**
 * Single-user auth context. The platform is personal: one owner account, no
 * tenants, no roles, no RLS. The context carries just the authenticated user id,
 * stored per-request in AsyncLocalStorage.
 */
export interface UserContext {
  readonly userId: string;
}

const storage = new AsyncLocalStorage<UserContext>();

export const runWithUserContext = <T>(ctx: UserContext, fn: () => T): T => storage.run(ctx, fn);

export const getUserContext = (): UserContext => {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('No auth context. Wrap with runWithUserContext().');
  return ctx;
};

export const tryGetUserContext = (): UserContext | undefined => storage.getStore();

export const requireUserContext = (): UserContext => getUserContext();

export const UserContextSchema = z.object({
  userId: z.string(),
});
