import { z } from 'zod';
import { IntervalSchema } from './time.js';

export const AlertChannelSchema = z.enum(['in_app', 'email', 'webhook']);
export type AlertChannel = z.infer<typeof AlertChannelSchema>;

export const AlertOperatorSchema = z.enum([
  'above',
  'below',
  'crosses_above',
  'crosses_below',
  'equals',
]);
export type AlertOperator = z.infer<typeof AlertOperatorSchema>;

export const PriceAlertConditionSchema = z.object({
  type: z.literal('price'),
  operator: AlertOperatorSchema,
  value: z.number().finite().positive(),
});

export const IndicatorAlertConditionSchema = z.object({
  type: z.literal('indicator'),
  indicatorId: z.string().min(1).max(80),
  interval: IntervalSchema.default('1h'),
  params: z.record(z.number().finite()).default({}),
  line: z.string().min(1).max(80).default('value'),
  operator: AlertOperatorSchema,
  value: z.number().finite(),
});

export type PriceAlertCondition = z.infer<typeof PriceAlertConditionSchema>;
export type IndicatorAlertCondition = z.infer<typeof IndicatorAlertConditionSchema>;

export type AlertCondition =
  | PriceAlertCondition
  | IndicatorAlertCondition
  | {
      type: 'multi';
      match: 'all' | 'any';
      conditions: readonly AlertCondition[];
    };

export const AlertConditionSchema: z.ZodType<AlertCondition, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.discriminatedUnion('type', [
    PriceAlertConditionSchema,
    IndicatorAlertConditionSchema,
    z.object({
      type: z.literal('multi'),
      match: z.enum(['all', 'any']),
      conditions: z.array(AlertConditionSchema).min(1).max(8),
    }),
  ]),
);

export const CreateAlertSchema = z.object({
  symbolId: z.string().min(1),
  name: z.string().min(1).max(120),
  condition: AlertConditionSchema,
  channels: z.array(AlertChannelSchema).min(1).max(3).default(['in_app']),
  /** Outbound webhook target; required for the `webhook` channel to deliver. */
  webhookUrl: z.string().url().max(2048).optional(),
  active: z.boolean().default(true),
  expiresAt: z.coerce.date().optional(),
});
export type CreateAlert = z.infer<typeof CreateAlertSchema>;

export const UpdateAlertSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  condition: AlertConditionSchema.optional(),
  channels: z.array(AlertChannelSchema).min(1).max(3).optional(),
  webhookUrl: z.string().url().max(2048).nullable().optional(),
  active: z.boolean().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});
export type UpdateAlert = z.infer<typeof UpdateAlertSchema>;

export const EvaluateAlertSchema = z.object({
  price: z.number().finite().positive().optional(),
  previousPrice: z.number().finite().positive().optional(),
});
export type EvaluateAlert = z.infer<typeof EvaluateAlertSchema>;

export const CreatePortfolioSchema = z.object({
  name: z.string().min(1).max(100),
  baseCurrency: z.string().min(3).max(8).default('USD'),
});
export type CreatePortfolio = z.infer<typeof CreatePortfolioSchema>;

export const UpdatePortfolioSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  baseCurrency: z.string().min(3).max(8).optional(),
});
export type UpdatePortfolio = z.infer<typeof UpdatePortfolioSchema>;

export const PortfolioTransactionSideSchema = z.enum(['buy', 'sell', 'dividend']);
export type PortfolioTransactionSide = z.infer<typeof PortfolioTransactionSideSchema>;

export const CreatePortfolioTransactionSchema = z.object({
  symbolId: z.string().min(1),
  side: PortfolioTransactionSideSchema,
  quantity: z.number().finite().nonnegative(),
  price: z.number().finite().nonnegative(),
  fee: z.number().finite().nonnegative().default(0),
  occurredAt: z.coerce.date().default(() => new Date()),
  note: z.string().max(500).optional(),
});
export type CreatePortfolioTransaction = z.infer<typeof CreatePortfolioTransactionSchema>;

export const CreatePaperAccountSchema = z.object({
  name: z.string().min(1).max(100),
  balance: z.number().finite().positive().default(100_000),
  currency: z.string().min(3).max(8).default('USD'),
  leverage: z.number().finite().positive().max(100).default(1),
});
export type CreatePaperAccount = z.infer<typeof CreatePaperAccountSchema>;

export const PaperOrderSideSchema = z.enum(['buy', 'sell']);
export type PaperOrderSide = z.infer<typeof PaperOrderSideSchema>;

export const PaperOrderTypeSchema = z.enum(['market', 'limit']);
export type PaperOrderType = z.infer<typeof PaperOrderTypeSchema>;

export const PlacePaperOrderSchema = z.object({
  symbolId: z.string().min(1),
  side: PaperOrderSideSchema,
  type: PaperOrderTypeSchema,
  quantity: z.number().finite().positive(),
  limitPrice: z.number().finite().positive().optional(),
  lastPrice: z.number().finite().positive().optional(),
  slippageBps: z.number().finite().min(0).max(1_000).default(0),
  feeBps: z.number().finite().min(0).max(1_000).default(1),
});
export type PlacePaperOrder = z.infer<typeof PlacePaperOrderSchema>;
