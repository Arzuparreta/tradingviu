import { BrokerCredentialsSchema, type BrokerCredentials } from '@tv/core';
import { AlpacaAdapter } from './alpaca.js';
import { BinanceAdapter } from './binance.js';
import { IbkrAdapter } from './ibkr.js';
import type { BrokerAdapter, FetchLike } from './types.js';

export const createBrokerAdapter = (
  input: BrokerCredentials,
  opts: { fetcher?: FetchLike } = {},
): BrokerAdapter => {
  const parsed = BrokerCredentialsSchema.parse(input);
  switch (parsed.broker) {
    case 'alpaca':
      return new AlpacaAdapter(parsed.credentials, opts);
    case 'binance':
      return new BinanceAdapter(parsed.credentials, opts);
    case 'ibkr':
      return new IbkrAdapter(parsed.credentials, opts);
  }
};
