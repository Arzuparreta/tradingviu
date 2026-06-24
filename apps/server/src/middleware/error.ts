import type { Context } from 'hono';
import { TvError, isTvError } from '@tv/core';

export const errorHandler = (err: Error, c: Context): Response => {
  if (isTvError(err)) {
    return c.json(
      { error: { code: err.code, message: err.message, meta: err.meta } },
      err.status as 400,
    );
  }
  console.error('unhandled error', err);
  return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500);
};
