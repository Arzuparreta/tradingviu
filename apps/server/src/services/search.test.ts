// Slice 3a — symbol search filter builder
// Pure unit test: no network, no env, no Meili required.
import { describe, it, expect } from 'bun:test';
import { buildSymbolFilter, SYMBOLS_INDEX } from './search.js';

describe('buildSymbolFilter', () => {
  it('always restricts to active symbols', () => {
    expect(buildSymbolFilter()).toBe('active = true');
  });

  it('adds an assetClass filter when provided', () => {
    expect(buildSymbolFilter({ assetClass: 'crypto' })).toBe('active = true AND assetClass = "crypto"');
  });

  it('quotes the assetClass value to avoid filter injection', () => {
    expect(buildSymbolFilter({ assetClass: 'a b' })).toContain('assetClass = "a b"');
  });

  it('exposes a stable index name', () => {
    expect(SYMBOLS_INDEX).toBe('symbols');
  });
});
