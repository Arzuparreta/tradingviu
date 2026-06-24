import { describe, expect, test } from 'bun:test';
import {
  CreateIdeaSchema,
  CreateSpaceSchema,
  IdeasQuerySchema,
  PublishScriptSchema,
  ScriptsQuerySchema,
  UpdateIdeaSchema,
} from './social-schemas.js';

describe('social schemas', () => {
  test('CreateIdea defaults visibility to public and trims title', () => {
    const idea = CreateIdeaSchema.parse({ title: '  Long AAPL into earnings  ', direction: 'long' });
    expect(idea.title).toBe('Long AAPL into earnings');
    expect(idea.visibility).toBe('public');
    expect(idea.body).toBeUndefined();
  });

  test('CreateIdea rejects unknown direction and empty title', () => {
    expect(() => CreateIdeaSchema.parse({ title: 'x', direction: 'sideways' })).toThrow();
    expect(() => CreateIdeaSchema.parse({ title: '   ' })).toThrow();
  });

  test('IdeasQuery coerces limit and defaults to 50', () => {
    expect(IdeasQuerySchema.parse({}).limit).toBe(50);
    expect(IdeasQuerySchema.parse({ limit: '10', author: 'me' })).toMatchObject({
      limit: 10,
      author: 'me',
    });
  });

  test('UpdateIdea allows partial updates', () => {
    expect(UpdateIdeaSchema.parse({ visibility: 'private' })).toEqual({ visibility: 'private' });
  });

  test('PublishScript defaults visibility/license/price and requires source', () => {
    const s = PublishScriptSchema.parse({ name: '  RSI Pro  ', source: 'indicator("x")' });
    expect(s.name).toBe('RSI Pro');
    expect(s.visibility).toBe('public');
    expect(s.license).toBe('AGPL-3.0');
    expect(s.priceCents).toBe(0);
    expect(() => PublishScriptSchema.parse({ name: 'x', source: '   ' })).toThrow();
    expect(() => PublishScriptSchema.parse({ name: 'x', source: 's', visibility: 'paid' })).toThrow();
  });

  test('ScriptsQuery coerces price filter and defaults sort to recent', () => {
    expect(ScriptsQuerySchema.parse({}).sort).toBe('recent');
    expect(ScriptsQuerySchema.parse({ free: 'true', sort: 'popular' })).toMatchObject({
      free: true,
      sort: 'popular',
    });
  });

  test('CreateSpace defaults visibility/price/currency and uppercases currency', () => {
    const s = CreateSpaceSchema.parse({ name: '  Momentum  ', currency: 'eur' });
    expect(s.name).toBe('Momentum');
    expect(s.visibility).toBe('public');
    expect(s.priceCents).toBe(0);
    expect(s.currency).toBe('EUR');
    expect(() => CreateSpaceSchema.parse({ name: 'x', currency: 'dollars' })).toThrow();
  });
});
