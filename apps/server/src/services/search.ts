import { MeiliSearch, type Index } from 'meilisearch';
import { eq } from 'drizzle-orm';
import { symbols, exchanges } from '@tv/db/schema';
import { loadEnv } from '@tv/core';
import type { Database } from '@tv/db';

export const SYMBOLS_INDEX = 'symbols';

export interface SymbolDoc {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  assetClass: string;
  currency: string;
  baseCurrency: string | null;
  quoteCurrency: string | null;
  active: boolean;
}

let client: MeiliSearch | null | undefined;

/** Returns a configured Meili client, or null if MEILI_HOST is not set (search disabled). */
const getClient = (): MeiliSearch | null => {
  if (client !== undefined) return client;
  const env = loadEnv();
  if (!env.MEILI_HOST) {
    client = null;
    return null;
  }
  client = new MeiliSearch({
    host: env.MEILI_HOST,
    ...(env.MEILI_MASTER_KEY ? { apiKey: env.MEILI_MASTER_KEY } : {}),
  });
  return client;
};

export const searchEnabled = (): boolean => getClient() !== null;

/** Create the symbols index (if missing) and apply searchable/filterable settings. Idempotent. */
export const ensureSymbolsIndex = async (): Promise<Index | null> => {
  const c = getClient();
  if (!c) return null;
  const task = await c.createIndex(SYMBOLS_INDEX, { primaryKey: 'id' });
  await c.waitForTask(task.taskUid);
  const index = c.index<SymbolDoc>(SYMBOLS_INDEX);
  await index.updateSettings({
    searchableAttributes: ['ticker', 'name', 'baseCurrency', 'quoteCurrency', 'exchange'],
    filterableAttributes: ['assetClass', 'exchange', 'active'],
    sortableAttributes: ['ticker'],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'exactness'],
    typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 3, twoTypos: 6 } },
  });
  return index;
};

const toDoc = (r: {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  assetClass: string;
  currency: string;
  baseCurrency: string | null;
  quoteCurrency: string | null;
  active: boolean;
}): SymbolDoc => r;

/** Read every symbol from the DB and (re)index it in Meili. Returns the count indexed. */
export const indexAllSymbols = async (db: Database): Promise<number> => {
  const index = await ensureSymbolsIndex();
  if (!index) return 0;
  const rows = await db
    .select({
      id: symbols.id,
      ticker: symbols.ticker,
      name: symbols.name,
      exchange: exchanges.code,
      assetClass: symbols.assetClass,
      currency: symbols.currency,
      baseCurrency: symbols.baseCurrency,
      quoteCurrency: symbols.quoteCurrency,
      active: symbols.active,
    })
    .from(symbols)
    .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId));
  if (rows.length === 0) return 0;
  const task = await index.addDocuments(rows.map(toDoc));
  await getClient()!.waitForTask(task.taskUid);
  return rows.length;
};

export interface SearchOptions {
  limit?: number;
  assetClass?: string;
}

/** Build the Meili filter expression for a symbol search. Pure — exported for testing. */
export const buildSymbolFilter = (opts: SearchOptions = {}): string => {
  const filters: string[] = ['active = true'];
  if (opts.assetClass) filters.push(`assetClass = ${JSON.stringify(opts.assetClass)}`);
  return filters.join(' AND ');
};

/** Typo-tolerant symbol search via Meili. Returns null when search is disabled (caller falls back to DB). */
export const searchSymbols = async (q: string, opts: SearchOptions = {}): Promise<SymbolDoc[] | null> => {
  const c = getClient();
  if (!c) return null;
  const index = c.index<SymbolDoc>(SYMBOLS_INDEX);
  const res = await index.search(q, {
    limit: opts.limit ?? 20,
    filter: buildSymbolFilter(opts),
  });
  return res.hits;
};
