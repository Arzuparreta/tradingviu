import 'hono';
import type { Database } from '@tv/db';
import type { TokenClaims } from '@tv/auth';
import type { RedisClient } from '../middleware/user-context.js';

declare module 'hono' {
  interface ContextVariableMap {
    db: Database;
    redis: RedisClient;
    claims: TokenClaims;
  }
}
