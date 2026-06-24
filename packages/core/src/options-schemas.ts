import { z } from 'zod';

export const OptionTypeSchema = z.enum(['call', 'put']);
export type OptionTypeT = z.infer<typeof OptionTypeSchema>;

export const OptionSideSchema = z.enum(['long', 'short']);
export type OptionSideT = z.infer<typeof OptionSideSchema>;

export const StrategyTemplateSchema = z.enum([
  'long_call',
  'long_put',
  'short_call',
  'short_put',
  'bull_call_spread',
  'bear_call_spread',
  'bull_put_spread',
  'bear_put_spread',
  'straddle',
  'strangle',
  'iron_condor',
  'iron_butterfly',
  'call_butterfly',
]);
export type StrategyTemplateT = z.infer<typeof StrategyTemplateSchema>;

export const PriceOptionSchema = z.object({
  type: OptionTypeSchema,
  spot: z.number().finite().positive(),
  strike: z.number().finite().positive(),
  timeToExpiry: z.number().finite().positive(),
  rate: z.number().finite().min(-1).max(1).default(0.05),
  volatility: z.number().finite().positive().max(10),
  dividendYield: z.number().finite().min(0).max(1).default(0),
});
export type PriceOption = z.infer<typeof PriceOptionSchema>;

export const OptionChainSchema = z.object({
  spot: z.number().finite().positive(),
  expiries: z.array(z.number().finite().positive().max(30)).min(1).max(12),
  rate: z.number().finite().min(-1).max(1).default(0.05),
  volatility: z.number().finite().positive().max(10).default(0.3),
  dividendYield: z.number().finite().min(0).max(1).default(0),
  strikes: z.array(z.number().finite().positive()).min(1).max(80).optional(),
  strikeStep: z.number().finite().positive().optional(),
  strikeCount: z.number().int().min(1).max(80).default(11),
});
export type OptionChainRequest = z.infer<typeof OptionChainSchema>;

export const StrategyLegInputSchema = z.object({
  type: OptionTypeSchema,
  side: OptionSideSchema,
  strike: z.number().finite().positive(),
  quantity: z.number().finite().positive().max(10_000).default(1),
  expiry: z.number().finite().positive().max(30).optional(),
  premium: z.number().finite().nonnegative().optional(),
});
export type StrategyLegInput = z.infer<typeof StrategyLegInputSchema>;

export const AnalyzeStrategySchema = z
  .object({
    template: StrategyTemplateSchema.optional(),
    legs: z.array(StrategyLegInputSchema).min(1).max(8).optional(),
    spot: z.number().finite().positive(),
    rate: z.number().finite().min(-1).max(1).default(0.05),
    volatility: z.number().finite().positive().max(10).default(0.3),
    timeToExpiry: z.number().finite().positive().max(30).default(30 / 365),
    dividendYield: z.number().finite().min(0).max(1).default(0),
    width: z.number().finite().positive().optional(),
    contracts: z.number().finite().positive().max(10_000).default(1),
    priceMin: z.number().finite().nonnegative().optional(),
    priceMax: z.number().finite().positive().optional(),
    steps: z.number().int().min(2).max(401).optional(),
  })
  .refine((v) => Boolean(v.template) || (v.legs !== undefined && v.legs.length > 0), {
    message: 'Provide either a strategy template or at least one custom leg',
  });
export type AnalyzeStrategyRequest = z.infer<typeof AnalyzeStrategySchema>;
