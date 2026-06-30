/**
 * One-off: clear the Meili symbols index and reindex from the DB. Needed after a
 * re-seed, because indexAllSymbols upserts by id and never removes stale ids, so
 * old documents (with ids no longer in the symbols table) otherwise linger and
 * break symbol search / chart switching.
 */
import { loadEnv } from '@tv/core';
import { createDb } from '@tv/db';
import { ensureSymbolsIndex, indexAllSymbols, searchEnabled } from './services/search.js';

const env = loadEnv();
if (!searchEnabled()) {
  console.log('MEILI_HOST not set — nothing to reindex.');
  process.exit(0);
}

const db = createDb({ url: env.DATABASE_URL });
const index = await ensureSymbolsIndex();
if (index) {
  const task = await index.deleteAllDocuments();
  await index.waitForTask(task.taskUid);
  console.log('[reindex] cleared stale symbols index');
}
const n = await indexAllSymbols(db);
console.log(`[reindex] indexed ${n} symbols`);
process.exit(0);
