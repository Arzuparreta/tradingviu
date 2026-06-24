import { createDb } from './client.js';
import { applyRls } from './rls-policies.js';
import { eq } from 'drizzle-orm';
import { plans, exchanges, symbols } from './schema/index.js';
import { DEFAULT_FREE_QUOTAS, UNLIMITED_QUOTAS } from './schema/plans.js';
import { ulid } from 'ulid';
import postgres from 'postgres';

const adminUrl = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
if (!adminUrl) {
  console.error('DATABASE_URL_ADMIN is required (or DATABASE_URL fallback)');
  process.exit(1);
}

const appUrl = process.env.DATABASE_URL;
if (!appUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const adminClient = postgres(adminUrl, { max: 1 });
const db = createDb({ url: adminUrl });

const APP_ROLE = 'tv_app';
const APP_PASSWORD = 'change-me-app';

console.log('applying RLS policies...');
await applyRls(db);

console.log('ensuring tv_app role...');
await adminClient`
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tv_app') THEN
      CREATE ROLE tv_app LOGIN PASSWORD 'change-me-app';
    END IF;
  END
  $$;
`;
await adminClient`GRANT CONNECT ON DATABASE tradingviu TO tv_app`;
await adminClient`GRANT USAGE ON SCHEMA public TO tv_app`;
await adminClient`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tv_app`;
await adminClient`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tv_app`;
await adminClient`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tv_app`;
await adminClient`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tv_app`;

console.log('seeding plans...');
await db
  .insert(plans)
  .values([
    {
      id: ulid(),
      code: 'free',
      name: 'Free',
      description: 'Try the platform. No card required.',
      priceMonthlyCents: 0,
      priceYearlyCents: 0,
      quotas: DEFAULT_FREE_QUOTAS,
      features: ['ad-free', '1 chart per tab', 'community support'],
      isDefault: true,
      sortOrder: 0,
    },
    {
      id: ulid(),
      code: 'essential',
      name: 'Essential',
      description: 'For active traders. Everything you need to chart and screen.',
      priceMonthlyCents: 1295,
      priceYearlyCents: 12950,
      quotas: {
        ...DEFAULT_FREE_QUOTAS,
        chartsPerTab: 2,
        indicatorsPerChart: 5,
        parallelConnections: 10,
        priceAlerts: 20,
        technicalAlerts: 20,
        historicalBars: 10_000,
        savedLayouts: 5,
        screenerAutoRefreshSeconds: 60,
        indicatorOnIndicator: 1,
        secondBasedIntervals: true,
        multiConditionAlerts: true,
        adFree: true,
      },
      features: ['volume profile', 'custom timeframes', 'range bars', 'bar replay'],
      sortOrder: 1,
    },
    {
      id: ulid(),
      code: 'plus',
      name: 'Plus',
      description: 'For serious traders. Volume footprint, deep backtesting, real-time alerts.',
      priceMonthlyCents: 2995,
      priceYearlyCents: 29950,
      quotas: {
        ...DEFAULT_FREE_QUOTAS,
        chartsPerTab: 4,
        indicatorsPerChart: 10,
        parallelConnections: 20,
        priceAlerts: 100,
        technicalAlerts: 100,
        historicalBars: 10_000,
        savedLayouts: 5,
        screenerAutoRefreshSeconds: 10,
        indicatorOnIndicator: 9,
        secondBasedIntervals: true,
        tickBasedIntervals: true,
        customFormulas: true,
        volumeFootprint: true,
        tpo: true,
        autoChartPatterns: true,
        multiConditionAlerts: true,
        webhookNotifications: true,
        publishInviteOnlyScripts: true,
        adFree: true,
      },
      features: ['volume footprint', 'TPO', 'auto chart patterns', 'webhooks'],
      sortOrder: 2,
    },
    {
      id: ulid(),
      code: 'premium',
      name: 'Premium',
      description: 'For professionals. Maximum historical depth, all features.',
      priceMonthlyCents: 5995,
      priceYearlyCents: 59950,
      quotas: {
        ...UNLIMITED_QUOTAS,
        chartsPerTab: 8,
        indicatorsPerChart: 25,
        parallelConnections: 50,
        priceAlerts: 400,
        technicalAlerts: 400,
        watchlistAlerts: 2,
        historicalBars: 20_000,
        screenerAutoRefreshSeconds: 10,
        indicatorOnIndicator: 24,
      },
      features: ['priority support', 'all features'],
      sortOrder: 3,
    },
    {
      id: ulid(),
      code: 'ultimate',
      name: 'Ultimate',
      description: 'No limits. For trading desks and power users.',
      priceMonthlyCents: 19995,
      priceYearlyCents: 199950,
      quotas: UNLIMITED_QUOTAS,
      features: ['priority support', 'dedicated backup feed', 'all features'],
      sortOrder: 4,
    },
  ])
  .onConflictDoNothing();

console.log('seeding exchanges...');
await db
  .insert(exchanges)
  .values([
    { id: ulid(), code: 'BINANCE', name: 'Binance', type: 'crypto', country: 'KY', url: 'https://binance.com' },
    { id: ulid(), code: 'COINBASE', name: 'Coinbase', type: 'crypto', country: 'US', url: 'https://coinbase.com' },
    { id: ulid(), code: 'KRAKEN', name: 'Kraken', type: 'crypto', country: 'US', url: 'https://kraken.com' },
    { id: ulid(), code: 'BYBIT', name: 'Bybit', type: 'crypto', country: 'AE', url: 'https://bybit.com' },
    { id: ulid(), code: 'NASDAQ', name: 'NASDAQ', type: 'stock', country: 'US', url: 'https://nasdaq.com' },
    { id: ulid(), code: 'NYSE', name: 'NYSE', type: 'stock', country: 'US', url: 'https://nyse.com' },
    { id: ulid(), code: 'TVC', name: 'TradingView Custom', type: 'index', country: 'XX' },
    { id: ulid(), code: 'CRYPTOCAP', name: 'CryptoCap', type: 'crypto', country: 'XX' },
  ])
  .onConflictDoNothing();

console.log('seeding starter symbols...');
const binanceId = (await db.select().from(exchanges).where(eq(exchanges.code, 'BINANCE')))[0]?.id;
const coinbaseId = (await db.select().from(exchanges).where(eq(exchanges.code, 'COINBASE')))[0]?.id;
const krakenId = (await db.select().from(exchanges).where(eq(exchanges.code, 'KRAKEN')))[0]?.id;

if (binanceId && coinbaseId && krakenId) {
  await db
    .insert(symbols)
    .values([
      { id: ulid(), exchangeId: binanceId, ticker: 'BTCUSDT', name: 'Bitcoin / TetherUS', assetClass: 'crypto', baseCurrency: 'BTC', quoteCurrency: 'USDT' },
      { id: ulid(), exchangeId: binanceId, ticker: 'ETHUSDT', name: 'Ethereum / TetherUS', assetClass: 'crypto', baseCurrency: 'ETH', quoteCurrency: 'USDT' },
      { id: ulid(), exchangeId: binanceId, ticker: 'SOLUSDT', name: 'Solana / TetherUS', assetClass: 'crypto', baseCurrency: 'SOL', quoteCurrency: 'USDT' },
      { id: ulid(), exchangeId: binanceId, ticker: 'BNBUSDT', name: 'BNB / TetherUS', assetClass: 'crypto', baseCurrency: 'BNB', quoteCurrency: 'USDT' },
      { id: ulid(), exchangeId: binanceId, ticker: 'XRPUSDT', name: 'XRP / TetherUS', assetClass: 'crypto', baseCurrency: 'XRP', quoteCurrency: 'USDT' },
      { id: ulid(), exchangeId: binanceId, ticker: 'DOGEUSDT', name: 'Dogecoin / TetherUS', assetClass: 'crypto', baseCurrency: 'DOGE', quoteCurrency: 'USDT' },
      { id: ulid(), exchangeId: binanceId, ticker: 'ADAUSDT', name: 'Cardano / TetherUS', assetClass: 'crypto', baseCurrency: 'ADA', quoteCurrency: 'USDT' },
      { id: ulid(), exchangeId: binanceId, ticker: 'AVAXUSDT', name: 'Avalanche / TetherUS', assetClass: 'crypto', baseCurrency: 'AVAX', quoteCurrency: 'USDT' },
      { id: ulid(), exchangeId: coinbaseId, ticker: 'BTCUSD', name: 'Bitcoin / US Dollar', assetClass: 'crypto', baseCurrency: 'BTC', quoteCurrency: 'USD', currency: 'USD' },
      { id: ulid(), exchangeId: coinbaseId, ticker: 'ETHUSD', name: 'Ethereum / US Dollar', assetClass: 'crypto', baseCurrency: 'ETH', quoteCurrency: 'USD', currency: 'USD' },
      { id: ulid(), exchangeId: krakenId, ticker: 'BTCUSD', name: 'Bitcoin / US Dollar (Kraken)', assetClass: 'crypto', baseCurrency: 'BTC', quoteCurrency: 'USD', currency: 'USD' },
    ])
    .onConflictDoNothing();
}

console.log('seed done');
process.exit(0);
