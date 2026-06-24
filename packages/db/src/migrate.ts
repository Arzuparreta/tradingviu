import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const db = createDb({ url });
await migrate(db, { migrationsFolder: './drizzle' });
console.log('migrations applied');
process.exit(0);
