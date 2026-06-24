import { z } from 'zod';

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping'), t: z.number().optional() }),
  z.object({ type: z.literal('subscribe'), symbol: z.string(), interval: z.string() }),
  z.object({ type: z.literal('unsubscribe'), symbol: z.string() }),
  z.object({ type: z.literal('auth'), token: z.string() }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), serverTime: z.number() }),
  z.object({ type: z.literal('pong'), t: z.number() }),
  z.object({ type: z.literal('subscribed'), symbol: z.string() }),
  z.object({ type: z.literal('unsubscribed'), symbol: z.string() }),
  z.object({ type: z.literal('bar'), symbol: z.string(), interval: z.string(), bar: z.unknown() }),
  z.object({ type: z.literal('quote'), symbol: z.string(), quote: z.unknown() }),
  z.object({ type: z.literal('trade'), symbol: z.string(), trade: z.unknown() }),
  z.object({ type: z.literal('alert'), alertId: z.string(), payload: z.unknown() }),
  z.object({ type: z.literal('error'), error: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
