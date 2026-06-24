import { z } from 'zod';

export const TradeSideSchema = z.enum(['buy', 'sell']);
export type TradeSide = z.infer<typeof TradeSideSchema>;

export const TradeSchema = z.object({
  time: z.number().int().nonnegative(),
  price: z.number().finite(),
  size: z.number().nonnegative(),
  side: TradeSideSchema.optional(),
  tradeId: z.string().optional(),
});
export type Trade = z.infer<typeof TradeSchema>;
