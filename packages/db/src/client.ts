import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDb>;

export interface DbOptions {
  url: string;
  max?: number;
  ssl?: 'require' | 'prefer' | false;
}

export const createDb = (opts: DbOptions) => {
  const client = postgres(opts.url, {
    max: opts.max ?? 20,
    ssl: opts.ssl ?? 'prefer',
    prepare: false,
  });
  return drizzle(client, { schema });
};

export { schema };
