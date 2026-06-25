import type { DataProvider, BarEventHandler } from '@tv/data-adapters';
import type { Stream, StreamEvent, StreamEventHandler, StreamKey } from './types.js';

export const createCcxtStream = (key: StreamKey, provider: DataProvider): Stream => {
  if (!provider.subscribe) {
    throw new Error(`Provider ${key.provider} does not support subscribe`);
  }
  const symbol = {
    id: `${key.provider}:${key.ticker}`,
    exchange: key.provider.toUpperCase(),
    ticker: key.ticker,
    name: key.ticker,
    assetClass: 'crypto' as const,
    currency: 'USD',
    active: true,
    metadata: {},
  };
  let unsub: (() => void) | null = null;
  let onEvent: StreamEventHandler | null = null;

  return {
    start(cb) {
      onEvent = cb;
      onEvent({ kind: 'status', status: 'connecting' });
      const onBarEvent: BarEventHandler = (e) => {
        if (e.kind === 'close') onEvent?.({ kind: 'close', bar: e.bar });
        else onEvent?.({ kind: 'update', bar: e.bar });
      };
      unsub = provider.subscribe!(symbol, onBarEvent, key.interval);
      onEvent({ kind: 'status', status: 'live' });
    },
    stop() {
      unsub?.();
      unsub = null;
    },
  };
};
