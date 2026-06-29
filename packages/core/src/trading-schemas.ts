import { z } from 'zod';
import { IntervalSchema } from './time.js';
import { DrawingSchema } from './drawing-schemas.js';

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

export const DrawingAlertConditionSchema = z.object({
  type: z.literal('drawing'),
  operator: AlertOperatorSchema,
  drawing: DrawingSchema,
  target: z.enum(['line', 'upper', 'lower']).default('line'),
});

export type PriceAlertCondition = z.infer<typeof PriceAlertConditionSchema>;
export type IndicatorAlertCondition = z.infer<typeof IndicatorAlertConditionSchema>;
export type DrawingAlertCondition = z.infer<typeof DrawingAlertConditionSchema>;

export type AlertCondition =
  | PriceAlertCondition
  | IndicatorAlertCondition
  | DrawingAlertCondition
  | {
      type: 'multi';
      match: 'all' | 'any';
      conditions: readonly AlertCondition[];
    };

export const AlertConditionSchema: z.ZodType<AlertCondition, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.discriminatedUnion('type', [
    PriceAlertConditionSchema,
    IndicatorAlertConditionSchema,
    DrawingAlertConditionSchema,
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
