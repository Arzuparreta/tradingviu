import type { CreatePortfolioTransaction } from '@tv/core';
import { ValidationError } from '@tv/core';

export interface PortfolioTransactionRow {
  readonly id: string;
  readonly symbolId: string;
  readonly side: string;
  readonly quantity: string;
  readonly price: string;
  readonly fee: string;
  readonly occurredAt: Date;
  readonly note: string | null;
}

export interface HoldingSnapshot {
  readonly symbolId: string;
  readonly quantity: number;
  readonly avgCost: number;
}

export interface PortfolioMetrics {
  readonly invested: number;
  readonly marketValue: number;
  readonly realizedPnl: number;
  readonly dividends: number;
  readonly fees: number;
  readonly openPositions: number;
}

interface PositionState {
  quantity: number;
  avgCost: number;
}

const numberFromText = (value: string, field: string): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`Invalid numeric ${field}`);
  return n;
};

export const validatePortfolioTransaction = (tx: CreatePortfolioTransaction): void => {
  if ((tx.side === 'buy' || tx.side === 'sell') && tx.quantity <= 0) {
    throw new ValidationError('Buy and sell transactions require quantity > 0');
  }
  if ((tx.side === 'buy' || tx.side === 'sell') && tx.price <= 0) {
    throw new ValidationError('Buy and sell transactions require price > 0');
  }
};

export const computeHoldings = (
  rows: ReadonlyArray<PortfolioTransactionRow>,
): { holdings: HoldingSnapshot[]; metrics: PortfolioMetrics } => {
  const positions = new Map<string, PositionState>();
  let realizedPnl = 0;
  let dividends = 0;
  let fees = 0;

  const sorted = [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  for (const row of sorted) {
    const quantity = numberFromText(row.quantity, 'quantity');
    const price = numberFromText(row.price, 'price');
    const fee = numberFromText(row.fee, 'fee');
    fees += fee;
    const current = positions.get(row.symbolId) ?? { quantity: 0, avgCost: 0 };

    if (row.side === 'buy') {
      const totalCost = current.quantity * current.avgCost + quantity * price + fee;
      const nextQuantity = current.quantity + quantity;
      positions.set(row.symbolId, {
        quantity: nextQuantity,
        avgCost: nextQuantity === 0 ? 0 : totalCost / nextQuantity,
      });
    } else if (row.side === 'sell') {
      if (quantity > current.quantity) throw new ValidationError('Cannot sell more than current holding');
      realizedPnl += quantity * (price - current.avgCost) - fee;
      const nextQuantity = current.quantity - quantity;
      positions.set(row.symbolId, {
        quantity: nextQuantity,
        avgCost: nextQuantity === 0 ? 0 : current.avgCost,
      });
    } else if (row.side === 'dividend') {
      dividends += price - fee;
    }
  }

  const holdings = [...positions.entries()]
    .filter(([, position]) => position.quantity > 0)
    .map(([symbolId, position]) => ({
      symbolId,
      quantity: position.quantity,
      avgCost: position.avgCost,
    }));

  const invested = holdings.reduce((sum, h) => sum + h.quantity * h.avgCost, 0);
  return {
    holdings,
    metrics: {
      invested,
      marketValue: invested,
      realizedPnl,
      dividends,
      fees,
      openPositions: holdings.length,
    },
  };
};

export const toDecimalText = (value: number): string => {
  if (!Number.isFinite(value)) throw new ValidationError('Invalid numeric value');
  return value.toFixed(8).replace(/\.?0+$/, '');
};
