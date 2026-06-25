import type { DataProvider } from '@tv/data-adapters';
import { createBinanceStream } from './binance.js';
import { createCcxtStream } from './ccxt.js';
import type { Stream, StreamKey } from './types.js';

export type { Stream, StreamKey, StreamEvent, StreamEventHandler, StreamStatus } from './types.js';

export interface CreateStreamOpts {
  key: StreamKey;
  provider: DataProvider;
}

export const createStream = (opts: CreateStreamOpts): Stream => {
  if (opts.key.provider === 'binance') {
    return createBinanceStream(opts.key);
  }
  return createCcxtStream(opts.key, opts.provider);
};
