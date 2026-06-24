import { describe, expect, test } from 'bun:test';
import { CreateIdeaSchema, IdeasQuerySchema, UpdateIdeaSchema } from './social-schemas.js';

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
});
