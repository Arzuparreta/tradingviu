import { ProviderRegistry, ccxt } from '@tv/data-adapters';

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
