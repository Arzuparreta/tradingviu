import { z } from 'zod';
import type { BrokerId } from '@tv/core';
import { BrokerAdapterError, type FetchLike } from './types.js';

export const parseFinite = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

export const optionalFinite = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = parseFinite(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const checkedJson = async <T>(
  broker: BrokerId,
  fetcher: FetchLike,
  input: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> => {
  const response = await fetcher(input, init);
  const text = await response.text();
  const raw = text.length > 0 ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const message =
      typeof raw === 'object' && raw !== null && 'message' in raw && typeof raw.message === 'string'
        ? raw.message
        : `HTTP ${response.status}`;
    throw new BrokerAdapterError(broker, message, raw);
  }
  return schema.parse(raw);
};

export const buildQuery = (params: Record<string, string | number | undefined>): string => {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) out.set(key, String(value));
  }
  return out.toString();
};
