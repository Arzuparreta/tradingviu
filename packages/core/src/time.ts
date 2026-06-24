export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

export const IntervalSchema = z.enum([
  '1s',
  '5s',
  '15s',
  '30s',
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M',
]);
import { z } from 'zod';
export type Interval = z.infer<typeof IntervalSchema>;

export const intervalToMs = (i: Interval): number => {
  switch (i) {
    case '1s':
      return SECOND;
    case '5s':
      return 5 * SECOND;
    case '15s':
      return 15 * SECOND;
    case '30s':
      return 30 * SECOND;
    case '1m':
      return MINUTE;
    case '3m':
      return 3 * MINUTE;
    case '5m':
      return 5 * MINUTE;
    case '15m':
      return 15 * MINUTE;
    case '30m':
      return 30 * MINUTE;
    case '1h':
      return HOUR;
    case '2h':
      return 2 * HOUR;
    case '4h':
      return 4 * HOUR;
    case '6h':
      return 6 * HOUR;
    case '12h':
      return 12 * HOUR;
    case '1d':
      return DAY;
    case '3d':
      return 3 * DAY;
    case '1w':
      return WEEK;
    case '1M':
      return 30 * DAY;
  }
};
