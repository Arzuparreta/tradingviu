import type { PlacePaperOrder } from '@tv/core';
import { ValidationError } from '@tv/core';

export interface PaperFillResult {
  readonly status: 'filled' | 'pending';
  readonly fillPrice?: number;
  readonly fee: number;
  readonly cashDelta: number;
}

export const executePaperOrder = (order: PlacePaperOrder): PaperFillResult => {
  if (order.type === 'limit' && order.limitPrice === undefined) {
    throw new ValidationError('Limit orders require limitPrice');
  }

  const referencePrice = order.lastPrice ?? order.limitPrice;
  if (referencePrice === undefined) {
    throw new ValidationError('Order requires lastPrice when no market data is available');
  }

  if (order.type === 'limit') {
    const limit = order.limitPrice;
    if (limit === undefined) throw new ValidationError('Limit orders require limitPrice');
    const marketable =
      order.lastPrice !== undefined &&
      (order.side === 'buy' ? order.lastPrice <= limit : order.lastPrice >= limit);
    if (!marketable) {
      return { status: 'pending', fee: 0, cashDelta: 0 };
    }
  }

  const slippage = referencePrice * (order.slippageBps / 10_000);
  const fillPrice = order.side === 'buy' ? referencePrice + slippage : referencePrice - slippage;
  const notional = fillPrice * order.quantity;
  const fee = notional * (order.feeBps / 10_000);
  const cashDelta = order.side === 'buy' ? -(notional + fee) : notional - fee;
  return { status: 'filled', fillPrice, fee, cashDelta };
};
