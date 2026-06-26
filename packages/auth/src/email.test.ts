import { describe, expect, test } from 'bun:test';
import { normalizeEmail } from './email.js';

describe('normalizeEmail', () => {
  test('trims and lowercases user input before auth lookup', () => {
    expect(normalizeEmail('  USER.Name+Tag@Example.COM  ')).toBe('user.name+tag@example.com');
  });
});
