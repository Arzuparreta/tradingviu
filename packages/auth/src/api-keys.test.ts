import { describe, expect, test } from 'bun:test';
import { generateApiKey, hashApiKey, parseApiKeyPrefix, verifyApiKey } from './api-keys.js';

describe('api keys', () => {
  test('generates a tvk_ key whose prefix and hash are consistent', () => {
    const g = generateApiKey();
    expect(g.key.startsWith('tvk_')).toBe(true);
    expect(g.key).toContain(`_${g.prefix}_`.slice(1)); // prefix is embedded
    expect(parseApiKeyPrefix(g.key)).toBe(g.prefix);
    expect(g.hash).toBe(hashApiKey(g.key));
    expect(g.hash).toHaveLength(64); // sha-256 hex
  });

  test('keys are unique across generations', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).not.toBe(b.prefix);
  });

  test('parseApiKeyPrefix rejects malformed keys', () => {
    expect(parseApiKeyPrefix('nope')).toBeNull();
    expect(parseApiKeyPrefix('tvk_only')).toBeNull();
    expect(parseApiKeyPrefix('')).toBeNull();
  });

  test('verifyApiKey is true only for the matching key', () => {
    const g = generateApiKey();
    expect(verifyApiKey(g.key, g.hash)).toBe(true);
    expect(verifyApiKey(g.key + 'x', g.hash)).toBe(false);
    expect(verifyApiKey(generateApiKey().key, g.hash)).toBe(false);
  });
});
