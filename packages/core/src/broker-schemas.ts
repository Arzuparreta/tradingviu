import { z } from 'zod';

export const BrokerIdSchema = z.enum(['alpaca', 'ibkr', 'binance']);
export type BrokerId = z.infer<typeof BrokerIdSchema>;

export const BrokerEnvironmentSchema = z.enum(['paper', 'live']);
export type BrokerEnvironment = z.infer<typeof BrokerEnvironmentSchema>;

export const BrokerConnectionStatusSchema = z.enum(['connected', 'error', 'disabled']);
export type BrokerConnectionStatus = z.infer<typeof BrokerConnectionStatusSchema>;

export const AlpacaCredentialsSchema = z.object({
  apiKey: z.string().min(1),
  secretKey: z.string().min(1),
  paper: z.boolean().default(true),
});
export type AlpacaCredentials = z.infer<typeof AlpacaCredentialsSchema>;

export const BinanceCredentialsSchema = z.object({
  apiKey: z.string().min(1),
  secretKey: z.string().min(1),
  testnet: z.boolean().default(true),
});
export type BinanceCredentials = z.infer<typeof BinanceCredentialsSchema>;

export const IbkrCredentialsSchema = z.object({
  baseUrl: z.string().url().default('https://localhost:5000/v1/api'),
  accountId: z.string().min(1).optional(),
});
export type IbkrCredentials = z.infer<typeof IbkrCredentialsSchema>;

export const BrokerCredentialsSchema = z.discriminatedUnion('broker', [
  z.object({ broker: z.literal('alpaca'), credentials: AlpacaCredentialsSchema }),
  z.object({ broker: z.literal('binance'), credentials: BinanceCredentialsSchema }),
  z.object({ broker: z.literal('ibkr'), credentials: IbkrCredentialsSchema }),
]);
export type BrokerCredentials = z.infer<typeof BrokerCredentialsSchema>;

export const CreateBrokerConnectionSchema = z.discriminatedUnion('broker', [
  z.object({
    broker: z.literal('alpaca'),
    label: z.string().min(1).max(100).optional(),
    accountId: z.string().min(1).max(120).optional(),
    environment: BrokerEnvironmentSchema.default('paper'),
    credentials: AlpacaCredentialsSchema,
  }),
  z.object({
    broker: z.literal('binance'),
    label: z.string().min(1).max(100).optional(),
    accountId: z.string().min(1).max(120).optional(),
    environment: BrokerEnvironmentSchema.default('paper'),
    credentials: BinanceCredentialsSchema,
  }),
  z.object({
    broker: z.literal('ibkr'),
    label: z.string().min(1).max(100).optional(),
    accountId: z.string().min(1).max(120).optional(),
    environment: BrokerEnvironmentSchema.default('paper'),
    credentials: IbkrCredentialsSchema,
  }),
]);
export type CreateBrokerConnection = z.infer<typeof CreateBrokerConnectionSchema>;

export const UpdateBrokerConnectionSchema = z.object({
  label: z.string().min(1).max(100).nullable().optional(),
  status: BrokerConnectionStatusSchema.optional(),
});
export type UpdateBrokerConnection = z.infer<typeof UpdateBrokerConnectionSchema>;

export const BrokerOrderSideSchema = z.enum(['buy', 'sell']);
export type BrokerOrderSide = z.infer<typeof BrokerOrderSideSchema>;

export const BrokerOrderTypeSchema = z.enum(['market', 'limit']);
export type BrokerOrderType = z.infer<typeof BrokerOrderTypeSchema>;

export const BrokerOrderStatusSchema = z.enum([
  'new',
  'partially_filled',
  'filled',
  'canceled',
  'rejected',
  'expired',
]);
export type BrokerOrderStatus = z.infer<typeof BrokerOrderStatusSchema>;

export const PlaceBrokerOrderSchema = z.object({
  symbol: z.string().min(1).max(40),
  side: BrokerOrderSideSchema,
  type: BrokerOrderTypeSchema,
  quantity: z.number().finite().positive(),
  limitPrice: z.number().finite().positive().optional(),
  timeInForce: z.string().min(1).max(20).default('day'),
});
export type PlaceBrokerOrder = z.infer<typeof PlaceBrokerOrderSchema>;

export const BrokerAccountSchema = z.object({
  id: z.string(),
  broker: BrokerIdSchema,
  name: z.string(),
  currency: z.string(),
  equity: z.number().finite(),
  cash: z.number().finite(),
  buyingPower: z.number().finite(),
  status: z.string(),
  raw: z.unknown().optional(),
});
export type BrokerAccount = z.infer<typeof BrokerAccountSchema>;

export const BrokerPositionSchema = z.object({
  broker: BrokerIdSchema,
  accountId: z.string().optional(),
  symbol: z.string(),
  quantity: z.number().finite(),
  averagePrice: z.number().finite().optional(),
  marketPrice: z.number().finite().optional(),
  marketValue: z.number().finite().optional(),
  unrealizedPnl: z.number().finite().optional(),
  raw: z.unknown().optional(),
});
export type BrokerPosition = z.infer<typeof BrokerPositionSchema>;

export const BrokerOrderSchema = z.object({
  id: z.string(),
  broker: BrokerIdSchema,
  accountId: z.string().optional(),
  symbol: z.string(),
  side: BrokerOrderSideSchema,
  type: BrokerOrderTypeSchema,
  quantity: z.number().finite(),
  limitPrice: z.number().finite().optional(),
  status: BrokerOrderStatusSchema,
  submittedAt: z.coerce.date().optional(),
  raw: z.unknown().optional(),
});
export type BrokerOrder = z.infer<typeof BrokerOrderSchema>;

export const BrokerHealthSchema = z.object({
  broker: BrokerIdSchema,
  ok: z.boolean(),
  latencyMs: z.number().finite().nonnegative(),
  message: z.string().optional(),
});
export type BrokerHealth = z.infer<typeof BrokerHealthSchema>;
