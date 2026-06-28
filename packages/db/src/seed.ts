import { createDb } from './client.js';
import { and, eq } from 'drizzle-orm';
import { loadEnv } from '@tv/core';

loadEnv();
import {
  earningsCalendar,
  dividendCalendar,
  economicEvents,
  fundamentalSnapshots,
  macroSeriesObservations,
  newsArticles,
  exchanges,
  symbols,
  yieldCurves,
} from './schema/index.js';
import { ulid } from 'ulid';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const db = createDb({ url });

console.log('seeding exchanges...');
await db
  .insert(exchanges)
  .values([
    {
      id: ulid(),
      code: 'BINANCE',
      name: 'Binance',
      type: 'crypto',
      country: 'KY',
      url: 'https://binance.com',
    },
    {
      id: ulid(),
      code: 'COINBASE',
      name: 'Coinbase',
      type: 'crypto',
      country: 'US',
      url: 'https://coinbase.com',
    },
    {
      id: ulid(),
      code: 'KRAKEN',
      name: 'Kraken',
      type: 'crypto',
      country: 'US',
      url: 'https://kraken.com',
    },
    {
      id: ulid(),
      code: 'BYBIT',
      name: 'Bybit',
      type: 'crypto',
      country: 'AE',
      url: 'https://bybit.com',
    },
    {
      id: ulid(),
      code: 'NASDAQ',
      name: 'NASDAQ',
      type: 'stock',
      country: 'US',
      url: 'https://nasdaq.com',
    },
    {
      id: ulid(),
      code: 'NYSE',
      name: 'NYSE',
      type: 'stock',
      country: 'US',
      url: 'https://nyse.com',
    },
    { id: ulid(), code: 'TVC', name: 'TradingView Custom', type: 'index', country: 'XX' },
    { id: ulid(), code: 'CRYPTOCAP', name: 'CryptoCap', type: 'crypto', country: 'XX' },
  ])
  .onConflictDoNothing();

console.log('seeding starter symbols...');
const binanceId = (await db.select().from(exchanges).where(eq(exchanges.code, 'BINANCE')))[0]?.id;
const coinbaseId = (await db.select().from(exchanges).where(eq(exchanges.code, 'COINBASE')))[0]?.id;
const krakenId = (await db.select().from(exchanges).where(eq(exchanges.code, 'KRAKEN')))[0]?.id;
const nasdaqId = (await db.select().from(exchanges).where(eq(exchanges.code, 'NASDAQ')))[0]?.id;

if (binanceId && coinbaseId && krakenId) {
  await db
    .insert(symbols)
    .values([
      {
        id: ulid(),
        exchangeId: binanceId,
        ticker: 'BTCUSDT',
        name: 'Bitcoin / TetherUS',
        assetClass: 'crypto',
        baseCurrency: 'BTC',
        quoteCurrency: 'USDT',
      },
      {
        id: ulid(),
        exchangeId: binanceId,
        ticker: 'ETHUSDT',
        name: 'Ethereum / TetherUS',
        assetClass: 'crypto',
        baseCurrency: 'ETH',
        quoteCurrency: 'USDT',
      },
      {
        id: ulid(),
        exchangeId: binanceId,
        ticker: 'SOLUSDT',
        name: 'Solana / TetherUS',
        assetClass: 'crypto',
        baseCurrency: 'SOL',
        quoteCurrency: 'USDT',
      },
      {
        id: ulid(),
        exchangeId: binanceId,
        ticker: 'BNBUSDT',
        name: 'BNB / TetherUS',
        assetClass: 'crypto',
        baseCurrency: 'BNB',
        quoteCurrency: 'USDT',
      },
      {
        id: ulid(),
        exchangeId: binanceId,
        ticker: 'XRPUSDT',
        name: 'XRP / TetherUS',
        assetClass: 'crypto',
        baseCurrency: 'XRP',
        quoteCurrency: 'USDT',
      },
      {
        id: ulid(),
        exchangeId: binanceId,
        ticker: 'DOGEUSDT',
        name: 'Dogecoin / TetherUS',
        assetClass: 'crypto',
        baseCurrency: 'DOGE',
        quoteCurrency: 'USDT',
      },
      {
        id: ulid(),
        exchangeId: binanceId,
        ticker: 'ADAUSDT',
        name: 'Cardano / TetherUS',
        assetClass: 'crypto',
        baseCurrency: 'ADA',
        quoteCurrency: 'USDT',
      },
      {
        id: ulid(),
        exchangeId: binanceId,
        ticker: 'AVAXUSDT',
        name: 'Avalanche / TetherUS',
        assetClass: 'crypto',
        baseCurrency: 'AVAX',
        quoteCurrency: 'USDT',
      },
      {
        id: ulid(),
        exchangeId: coinbaseId,
        ticker: 'BTCUSD',
        name: 'Bitcoin / US Dollar',
        assetClass: 'crypto',
        baseCurrency: 'BTC',
        quoteCurrency: 'USD',
        currency: 'USD',
      },
      {
        id: ulid(),
        exchangeId: coinbaseId,
        ticker: 'ETHUSD',
        name: 'Ethereum / US Dollar',
        assetClass: 'crypto',
        baseCurrency: 'ETH',
        quoteCurrency: 'USD',
        currency: 'USD',
      },
      {
        id: ulid(),
        exchangeId: krakenId,
        ticker: 'BTCUSD',
        name: 'Bitcoin / US Dollar (Kraken)',
        assetClass: 'crypto',
        baseCurrency: 'BTC',
        quoteCurrency: 'USD',
        currency: 'USD',
      },
    ])
    .onConflictDoNothing();
}

if (nasdaqId) {
  await db
    .insert(symbols)
    .values([
      {
        id: ulid(),
        exchangeId: nasdaqId,
        ticker: 'AAPL',
        name: 'Apple Inc.',
        assetClass: 'stock',
        currency: 'USD',
        country: 'US',
        sector: 'Technology',
        industry: 'Consumer Electronics',
        metadata: {
          marketCap: 3_250_000_000_000,
          peRatio: 31.4,
          eps: 6.43,
          revenue: 391_000_000_000,
          dividendYield: 0.0048,
          roe: 1.47,
          revenueGrowth: 0.061,
          earningsGrowth: 0.073,
          beta: 1.18,
          '52WeekHigh': 238.1,
          '52WeekLow': 164.08,
        },
      },
      {
        id: ulid(),
        exchangeId: nasdaqId,
        ticker: 'MSFT',
        name: 'Microsoft Corporation',
        assetClass: 'stock',
        currency: 'USD',
        country: 'US',
        sector: 'Technology',
        industry: 'Software',
        metadata: {
          marketCap: 3_540_000_000_000,
          peRatio: 35.8,
          eps: 13.3,
          revenue: 281_700_000_000,
          dividendYield: 0.0065,
          roe: 0.36,
          revenueGrowth: 0.15,
          earningsGrowth: 0.17,
          beta: 0.92,
          '52WeekHigh': 468.35,
          '52WeekLow': 344.77,
        },
      },
    ])
    .onConflictDoNothing();

  await db
    .update(symbols)
    .set({
      metadata: {
        marketCap: 3_250_000_000_000,
        peRatio: 31.4,
        eps: 6.43,
        revenue: 391_000_000_000,
        dividendYield: 0.0048,
        roe: 1.47,
        revenueGrowth: 0.061,
        earningsGrowth: 0.073,
        beta: 1.18,
        '52WeekHigh': 238.1,
        '52WeekLow': 164.08,
      },
    })
    .where(and(eq(symbols.exchangeId, nasdaqId), eq(symbols.ticker, 'AAPL')));

  await db
    .update(symbols)
    .set({
      metadata: {
        marketCap: 3_540_000_000_000,
        peRatio: 35.8,
        eps: 13.3,
        revenue: 281_700_000_000,
        dividendYield: 0.0065,
        roe: 0.36,
        revenueGrowth: 0.15,
        earningsGrowth: 0.17,
        beta: 0.92,
        '52WeekHigh': 468.35,
        '52WeekLow': 344.77,
      },
    })
    .where(and(eq(symbols.exchangeId, nasdaqId), eq(symbols.ticker, 'MSFT')));
}

console.log('seeding discovery demo data...');
const aapl = nasdaqId
  ? (
      await db
        .select()
        .from(symbols)
        .where(and(eq(symbols.exchangeId, nasdaqId), eq(symbols.ticker, 'AAPL')))
        .limit(1)
    )[0]
  : undefined;
const msft = nasdaqId
  ? (
      await db
        .select()
        .from(symbols)
        .where(and(eq(symbols.exchangeId, nasdaqId), eq(symbols.ticker, 'MSFT')))
        .limit(1)
    )[0]
  : undefined;

await db
  .insert(newsArticles)
  .values([
    {
      id: ulid(),
      source: 'Tradingviu Demo',
      url: 'https://example.com/tradingviu/news/crypto-liquidity',
      title: 'Crypto liquidity firms up as majors hold trend support',
      body: 'Bitcoin and Ethereum remain the main focus for intraday momentum desks as spot volumes improve.',
      symbols: ['BTCUSDT', 'ETHUSDT'],
      sentiment: 'positive',
      publishedAt: new Date('2026-06-20T13:30:00.000Z'),
    },
    {
      id: ulid(),
      source: 'Tradingviu Demo',
      url: 'https://example.com/tradingviu/news/macro-dollar-watch',
      title: 'Dollar traders watch the next inflation print for rate-cut timing',
      body: 'The macro calendar is likely to steer risk appetite across equities, rates and crypto pairs.',
      symbols: ['AAPL', 'MSFT', 'BTCUSDT'],
      sentiment: 'neutral',
      publishedAt: new Date('2026-06-23T09:00:00.000Z'),
    },
  ])
  .onConflictDoNothing();

if (aapl && msft) {
  await db
    .insert(fundamentalSnapshots)
    .values([
      {
        id: ulid(),
        symbolId: aapl.id,
        fiscalPeriod: 'ttm',
        periodEnd: new Date('2026-06-30T00:00:00.000Z'),
        source: 'Tradingviu Demo',
        currency: 'USD',
        isLatest: true,
        marketCap: 3_250_000_000_000,
        peRatio: 31.4,
        eps: 6.43,
        revenue: 391_000_000_000,
        dividendYield: 0.0048,
        roe: 1.47,
        revenueGrowth: 0.061,
        earningsGrowth: 0.073,
        beta: 1.18,
        week52High: 238.1,
        week52Low: 164.08,
        metadata: {
          enterpriseValue: 3_300_000_000_000,
          forwardPe: 28.9,
          pegRatio: 2.6,
          priceToSales: 8.3,
          priceToBook: 46.2,
          priceToFcf: 30.1,
          evToEbitda: 23.5,
          evToSales: 8.4,
          evToEbit: 24.8,
          earningsYield: 0.032,
          epsDiluted: 6.4,
          bookValuePerShare: 4.4,
          cashPerShare: 4.0,
          revenuePerShare: 25.4,
          fcfPerShare: 6.6,
          dividendPerShare: 1.0,
          roa: 0.28,
          roic: 0.55,
          grossMargin: 0.46,
          operatingMargin: 0.31,
          netMargin: 0.25,
          ebitdaMargin: 0.34,
          fcfMargin: 0.26,
          grossProfit: 180_000_000_000,
          operatingIncome: 123_000_000_000,
          ebitda: 134_000_000_000,
          ebit: 122_000_000_000,
          netIncome: 99_800_000_000,
          freeCashFlow: 101_000_000_000,
          operatingCashFlow: 118_000_000_000,
          epsGrowth: 0.07,
          revenueGrowth3y: 0.08,
          revenueGrowth5y: 0.11,
          dividendGrowth: 0.04,
          payoutRatio: 0.16,
          yearsOfDividendGrowth: 13,
          totalAssets: 352_000_000_000,
          totalDebt: 108_000_000_000,
          netDebt: 50_000_000_000,
          cashAndEquivalents: 61_000_000_000,
          totalEquity: 70_000_000_000,
          sharesOutstanding: 15_200_000_000,
          currentRatio: 0.99,
          quickRatio: 0.92,
          debtToEquity: 1.54,
          interestCoverage: 30.0,
          netDebtToEbitda: 0.37,
          change1m: 0.043,
          change3m: 0.082,
          changeYtd: 0.09,
          change1y: 0.18,
          distanceFrom52WHigh: -0.05,
          distanceFrom52WLow: 0.38,
          rsi14: 58.2,
          volatility30d: 0.22,
          avgVolume30d: 58_000_000,
          relativeVolume: 0.93,
          sma50: 219.5,
          sma200: 205.0,
          priceToSma200: 1.1,
          institutionalOwnership: 0.62,
          shortFloat: 0.008,
          analystRating: 4.1,
          priceTarget: 250.0,
          numAnalysts: 41,
        },
      },
      {
        id: ulid(),
        symbolId: msft.id,
        fiscalPeriod: 'ttm',
        periodEnd: new Date('2026-06-30T00:00:00.000Z'),
        source: 'Tradingviu Demo',
        currency: 'USD',
        isLatest: true,
        marketCap: 3_540_000_000_000,
        peRatio: 35.8,
        eps: 13.3,
        revenue: 281_700_000_000,
        dividendYield: 0.0065,
        roe: 0.36,
        revenueGrowth: 0.15,
        earningsGrowth: 0.17,
        beta: 0.92,
        week52High: 468.35,
        week52Low: 344.77,
        metadata: {
          enterpriseValue: 3_560_000_000_000,
          forwardPe: 31.2,
          pegRatio: 2.1,
          priceToSales: 12.6,
          priceToBook: 11.8,
          priceToFcf: 38.4,
          evToEbitda: 24.1,
          evToSales: 12.7,
          evToEbit: 27.6,
          earningsYield: 0.028,
          epsDiluted: 13.2,
          bookValuePerShare: 40.2,
          cashPerShare: 10.5,
          revenuePerShare: 37.9,
          fcfPerShare: 12.4,
          dividendPerShare: 3.0,
          roa: 0.18,
          roic: 0.29,
          grossMargin: 0.69,
          operatingMargin: 0.45,
          netMargin: 0.36,
          ebitdaMargin: 0.54,
          fcfMargin: 0.33,
          grossProfit: 194_000_000_000,
          operatingIncome: 127_000_000_000,
          ebitda: 152_000_000_000,
          ebit: 127_000_000_000,
          netIncome: 101_000_000_000,
          freeCashFlow: 92_000_000_000,
          operatingCashFlow: 134_000_000_000,
          epsGrowth: 0.19,
          revenueGrowth3y: 0.16,
          revenueGrowth5y: 0.14,
          dividendGrowth: 0.1,
          payoutRatio: 0.25,
          yearsOfDividendGrowth: 20,
          totalAssets: 512_000_000_000,
          totalDebt: 97_000_000_000,
          netDebt: 30_000_000_000,
          cashAndEquivalents: 67_000_000_000,
          totalEquity: 268_000_000_000,
          sharesOutstanding: 7_430_000_000,
          currentRatio: 1.27,
          quickRatio: 1.22,
          debtToEquity: 0.36,
          interestCoverage: 42.0,
          netDebtToEbitda: 0.2,
          change1m: 0.031,
          change3m: 0.064,
          changeYtd: 0.12,
          change1y: 0.24,
          distanceFrom52WHigh: -0.03,
          distanceFrom52WLow: 0.32,
          rsi14: 61.5,
          volatility30d: 0.19,
          avgVolume30d: 22_000_000,
          relativeVolume: 0.88,
          sma50: 452.0,
          sma200: 421.0,
          priceToSma200: 1.08,
          institutionalOwnership: 0.74,
          shortFloat: 0.006,
          analystRating: 4.5,
          priceTarget: 510.0,
          numAnalysts: 54,
        },
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(earningsCalendar)
    .values([
      {
        id: ulid(),
        symbolId: aapl.id,
        date: new Date('2026-07-02T20:00:00.000Z'),
        epsEstimate: '1.42',
        revenueEstimate: '89.3B',
      },
      {
        id: ulid(),
        symbolId: msft.id,
        date: new Date('2026-07-09T20:00:00.000Z'),
        epsEstimate: '3.21',
        revenueEstimate: '69.8B',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(dividendCalendar)
    .values([
      {
        id: ulid(),
        symbolId: aapl.id,
        exDate: new Date('2026-08-11T04:00:00.000Z'),
        paymentDate: new Date('2026-08-18T04:00:00.000Z'),
        recordDate: new Date('2026-08-12T04:00:00.000Z'),
        declarationDate: new Date('2026-07-31T20:00:00.000Z'),
        amount: '0.26',
        currency: 'USD',
        frequency: 'quarterly',
      },
      {
        id: ulid(),
        symbolId: msft.id,
        exDate: new Date('2026-08-20T04:00:00.000Z'),
        paymentDate: new Date('2026-09-10T04:00:00.000Z'),
        recordDate: new Date('2026-08-21T04:00:00.000Z'),
        declarationDate: new Date('2026-06-17T20:00:00.000Z'),
        amount: '0.83',
        currency: 'USD',
        frequency: 'quarterly',
      },
    ])
    .onConflictDoNothing();
}

const demoEconomicAt = new Date('2026-06-26T12:30:00.000Z');
await db
  .insert(economicEvents)
  .values({
    id: ulid(),
    country: 'US',
    eventAt: demoEconomicAt,
    name: 'Core PCE Price Index',
    importance: 'high',
    forecast: '0.2%',
    previous: '0.2%',
  })
  .onConflictDoNothing();

const demoCurveDate = new Date('2026-06-23T00:00:00.000Z');
await db
  .insert(yieldCurves)
  .values([
    {
      id: ulid(),
      country: 'US',
      curveDate: demoCurveDate,
      tenorMonths: 3,
      rate: 4.82,
      currency: 'USD',
      source: 'Tradingviu Demo',
    },
    {
      id: ulid(),
      country: 'US',
      curveDate: demoCurveDate,
      tenorMonths: 24,
      rate: 4.61,
      currency: 'USD',
      source: 'Tradingviu Demo',
    },
    {
      id: ulid(),
      country: 'US',
      curveDate: demoCurveDate,
      tenorMonths: 60,
      rate: 4.43,
      currency: 'USD',
      source: 'Tradingviu Demo',
    },
    {
      id: ulid(),
      country: 'US',
      curveDate: demoCurveDate,
      tenorMonths: 120,
      rate: 4.38,
      currency: 'USD',
      source: 'Tradingviu Demo',
    },
    {
      id: ulid(),
      country: 'US',
      curveDate: demoCurveDate,
      tenorMonths: 360,
      rate: 4.72,
      currency: 'USD',
      source: 'Tradingviu Demo',
    },
  ])
  .onConflictDoNothing();

await db
  .insert(macroSeriesObservations)
  .values([
    {
      id: ulid(),
      country: 'US',
      metricCode: 'CPI_YOY',
      metricName: 'Consumer Price Index YoY',
      observedAt: new Date('2026-05-31T00:00:00.000Z'),
      value: 2.8,
      unit: '%',
      frequency: 'monthly',
      source: 'Tradingviu Demo',
    },
    {
      id: ulid(),
      country: 'US',
      metricCode: 'UNRATE',
      metricName: 'Unemployment Rate',
      observedAt: new Date('2026-05-31T00:00:00.000Z'),
      value: 4.1,
      unit: '%',
      frequency: 'monthly',
      source: 'Tradingviu Demo',
    },
    {
      id: ulid(),
      country: 'US',
      metricCode: 'GDP_QOQ',
      metricName: 'Real GDP QoQ',
      observedAt: new Date('2026-03-31T00:00:00.000Z'),
      value: 1.4,
      unit: '%',
      frequency: 'quarterly',
      source: 'Tradingviu Demo',
    },
    {
      id: ulid(),
      country: 'US',
      metricCode: 'FEDFUNDS',
      metricName: 'Effective Federal Funds Rate',
      observedAt: new Date('2026-05-31T00:00:00.000Z'),
      value: 4.83,
      unit: '%',
      frequency: 'monthly',
      source: 'Tradingviu Demo',
    },
  ])
  .onConflictDoNothing();

console.log('seed done');
process.exit(0);
