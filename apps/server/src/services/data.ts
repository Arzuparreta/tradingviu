import { ProviderRegistry, ccxt } from '@tv/data-adapters';
import type { Database } from '@tv/db';
import { BarStore, type BarStoreOpts } from './bar-store.js';

const registry = new ProviderRegistry();

let _initialized = false;

export const initDataProviders = () => {
  if (_initialized) return;
  registry.register(ccxt.createBinance());
  registry.register(ccxt.createCoinbase());
  registry.register(ccxt.createKraken());
  registry.register(ccxt.createBybit());
  _initialized = true;
};

initDataProviders();

export const getProvider = (id: string) => registry.get(id);

export const listProviders = () => registry.list();

export { registry as dataRegistry };

let _barStore: BarStore | null = null;

export const initBarStore = (db: Database, opts: BarStoreOpts): BarStore => {
  if (_barStore) return _barStore;
  _barStore = new BarStore(db, getProvider, opts);
  return _barStore;
};

export const getBarStore = (): BarStore => {
  if (!_barStore) {
    throw new Error('BarStore not initialized. Call initBarStore() at server boot.');
  }
  return _barStore;
};

export const shutdownBarStore = async (): Promise<void> => {
  if (_barStore) {
    await _barStore.shutdown();
    _barStore = null;
  }
};
