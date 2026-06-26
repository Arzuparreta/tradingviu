import { afterEach, describe, expect, test } from 'bun:test';
import { MarketStore, type MarketEvent } from './market-store.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  sendMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const originalWebSocket = globalThis.WebSocket;

afterEach(() => {
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: originalWebSocket,
  });
  FakeWebSocket.instances = [];
});

describe('MarketStore', () => {
  test('reconnects when a later subscriber expands requested channels', () => {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: FakeWebSocket,
    });
    const store = new MarketStore();
    const quoteEvents: MarketEvent[] = [];
    const bookEvents: MarketEvent[] = [];

    const unsubscribeQuote = store.subscribe(
      { provider: 'binance', ticker: 'BTCUSDT' },
      ['quote'],
      (event) => quoteEvents.push(event),
    );
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.url).toContain('btcusdt@bookTicker');
    expect(FakeWebSocket.instances[0]!.url).not.toContain('btcusdt@depth20@100ms');

    const unsubscribeBook = store.subscribe(
      { provider: 'binance', ticker: 'BTCUSDT' },
      ['book'],
      (event) => bookEvents.push(event),
    );
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[0]!.closed).toBe(true);
    expect(FakeWebSocket.instances[1]!.url).toContain('btcusdt@bookTicker');
    expect(FakeWebSocket.instances[1]!.url).toContain('btcusdt@depth20@100ms');

    FakeWebSocket.instances[1]!.sendMessage({
      data: {
        bids: [['100', '1']],
        asks: [['101', '2']],
      },
    });
    expect(quoteEvents.some((event) => event.kind === 'book')).toBe(false);
    expect(bookEvents.some((event) => event.kind === 'book')).toBe(true);

    unsubscribeQuote();
    unsubscribeBook();
    store.shutdown();
  });
});
