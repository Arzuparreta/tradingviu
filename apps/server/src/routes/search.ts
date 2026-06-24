import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, or, ilike, sql } from 'drizzle-orm';
import { symbols, exchanges } from '@tv/db/schema';
import { searchSymbols } from '../services/search.js';

const SearchQuery = z.object({
  q: z.string().min(1).max(80),
  assetClass: z.string().max(40).optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

interface SymbolResult {
  id: string;
  exchange: string;
  ticker: string;
  name: string;
  assetClass: string;
  currency: string;
  active: boolean;
}

export const searchRoutes = new Hono().get(
  '/search',
  zValidator('query', SearchQuery),
  async (c) => {
    const { q, limit, assetClass } = c.req.valid('query');

    // Prefer Meili (typo-tolerant). Fall back to DB ilike if Meili is disabled or unreachable.
    try {
      const hits = await searchSymbols(q, { limit, ...(assetClass ? { assetClass } : {}) });
      if (hits) {
        const results: SymbolResult[] = hits.map((h) => ({
          id: h.id,
          exchange: h.exchange,
          ticker: h.ticker,
          name: h.name,
          assetClass: h.assetClass,
          currency: h.currency,
          active: h.active,
        }));
        return c.json({ results, backend: 'meili' as const });
      }
    } catch (err) {
      console.warn('[search] meili failed, falling back to db:', (err as Error).message);
    }

    const db = c.get('db');
    const like = `%${q}%`;
    const rows = await db
      .select({
        id: symbols.id,
        exchange: exchanges.code,
        ticker: symbols.ticker,
        name: symbols.name,
        assetClass: symbols.assetClass,
        currency: symbols.currency,
        active: symbols.active,
      })
      .from(symbols)
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(
        and(
          eq(symbols.active, true),
          assetClass ? eq(symbols.assetClass, assetClass) : undefined,
          or(ilike(symbols.ticker, like), ilike(symbols.name, like)),
        ),
      )
      // Rank ticker matches ahead of name-only matches (a poor-man's Meili relevance).
      .orderBy(sql`CASE WHEN ${symbols.ticker} ILIKE ${like} THEN 0 ELSE 1 END`, symbols.ticker)
      .limit(limit);
    return c.json({ results: rows, backend: 'db' as const });
  },
);
