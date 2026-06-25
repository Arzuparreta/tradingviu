import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.js';
import { loadEnv } from '@tv/core';

loadEnv();

const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_ADMIN is required (or DATABASE_URL fallback)');
  process.exit(1);
}

const db = createDb({ url });
await migrate(db, { migrationsFolder: './drizzle' });
console.log('migrations applied');
process.exit(0);
