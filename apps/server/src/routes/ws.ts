import { Hono } from 'hono';

export const wsRoutes = new Hono().get('/ws', (c) => {
  return c.json({ info: 'WebSocket endpoint. Connect with WebSocket upgrade.', upgrade: 'ws' }, 426);
});
