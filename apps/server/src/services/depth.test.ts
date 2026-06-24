import { describe, expect, test } from 'bun:test';
import { buildDomBook, estimateTickSize } from './depth.js';

describe('depth ladder', () => {
  test('builds monotonic bid and ask books around the mid', () => {
    const book = buildDomBook({
      lastPrice: 100,
      high: 102,
      low: 98,
      volume: 50_000,
      levels: 8,
      tickSize: 0.05,
    });

    expect(book.bids).toHaveLength(8);
    expect(book.asks).toHaveLength(8);
    expect(book.bids[0]!.price).toBeLessThan(book.asks[0]!.price);
    expect(book.bids[1]!.price).toBeLessThan(book.bids[0]!.price);
    expect(book.asks[1]!.price).toBeGreaterThan(book.asks[0]!.price);
    expect(book.bids.at(-1)!.cumulative).toBeGreaterThan(book.bids[0]!.size);
    expect(book.imbalance).toBeGreaterThanOrEqual(-1);
    expect(book.imbalance).toBeLessThanOrEqual(1);
  });

  test('estimates smaller ticks for lower-priced symbols', () => {
    expect(estimateTickSize(25)).toBe(0.01);
    expect(estimateTickSize(2_500)).toBe(0.5);
    expect(estimateTickSize(0.5)).toBe(0.0001);
  });
});
