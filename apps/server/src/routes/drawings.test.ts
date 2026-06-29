import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { runWithUserContext, type UserContext } from '@tv/core';
import { drawingRoutes } from './drawings.js';

interface FakeRow {
  id: string;
  scopeId: string;
  [key: string]: unknown;
}

class FakeDb {
  inserted: FakeRow[] = [];
  deleted = false;

  select() {
    return {
      from: () => ({
        where: async () => [],
      }),
    };
  }

  delete() {
    return {
      where: async () => {
        this.deleted = true;
        return undefined;
      },
    };
  }

  insert() {
    return {
      values: (rows: FakeRow[]) => {
        this.inserted = rows;
        return {
          onConflictDoUpdate: async () => undefined,
        };
      },
    };
  }
}

const tenant: UserContext = {
  userId: 'user_1',
};

const drawingPayload = {
  id: 'drawing_1',
  engine: 'klinecharts',
  name: 'segment',
  points: [
    { timestamp: 1700000000000, value: 100 },
    { timestamp: 1700003600000, value: 110 },
  ],
  styles: { line: { color: '#f5c542', size: 2 } },
  mode: 'normal',
  lock: false,
  visible: true,
  zLevel: 0,
  createdAt: 1,
  updatedAt: 2,
} as const;

const appFor = (db: FakeDb): Hono => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db', db as never);
    await runWithUserContext(tenant, next);
  });
  app.route('/api', drawingRoutes);
  return app;
};

const putDrawings = async (app: Hono, query: string): Promise<Response> =>
  await app.request(`/api/drawings?${query}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ drawings: [drawingPayload] }),
  });

describe('drawing routes', () => {
  test('stores drawings under an explicit chart scope', async () => {
    const db = new FakeDb();
    const response = await putDrawings(appFor(db), 'symbol=sym_btc&interval=1h&scope=panel_a');

    expect(response.status).toBe(200);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]?.scopeId).toBe('panel_a');
  });

  test('keeps the legacy symbol interval scope when no chart scope is provided', async () => {
    const db = new FakeDb();
    const response = await putDrawings(appFor(db), 'symbol=sym_btc&interval=1h');

    expect(response.status).toBe(200);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]?.scopeId).toBe('symbol:sym_btc:1h');
  });

  test('batch upserts and deletes within the requested chart scope', async () => {
    const db = new FakeDb();
    const response = await appFor(db).request('/api/drawings/batch?symbol=sym_btc&interval=1h&scope=panel_a', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ upsert: [drawingPayload], deleteIds: ['old_drawing'] }),
    });

    expect(response.status).toBe(200);
    expect(db.deleted).toBe(true);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]?.scopeId).toBe('panel_a');
  });
});
