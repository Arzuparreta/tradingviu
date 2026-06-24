import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/schema/tenants.ts',
    './src/schema/symbols.ts',
    './src/schema/market.ts',
    './src/schema/plans.ts',
    './src/schema/remaining.ts',
  ],
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://tradingviu:tradingviu@localhost:5432/tradingviu',
  },
  strict: true,
  verbose: true,
});
