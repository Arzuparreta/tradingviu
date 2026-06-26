import { z } from 'zod';

/** A holding enriched with its current price and reference metadata. */
export interface AnalyticsPosition {
  readonly symbolId: string;
  readonly ticker: string;
  readonly quantity: number;
  readonly avgCost: number;
  readonly price: number;
  readonly assetClass?: string | null;
  readonly sector?: string | null;
}

export interface PositionAnalytics {
  readonly symbolId: string;
  readonly ticker: string;
  readonly quantity: number;
  readonly avgCost: number;
  readonly price: number;
  readonly marketValue: number;
  readonly costBasis: number;
  readonly unrealizedPnl: number;
  readonly unrealizedPnlPct: number;
  /** Share of total market value, in [0, 1]. */
  readonly weight: number;
  /** Share of the portfolio's total unrealized P&L (signed); 0 when total is 0. */
  readonly pnlContribution: number;
}

export interface AllocationSlice {
  readonly key: string;
  readonly marketValue: number;
  readonly weight: number;
}

export interface ConcentrationStats {
  /** Herfindahl–Hirschman Index: Σ weightᵢ², in [0, 1]. */
  readonly hhi: number;
  readonly topWeight: number;
  readonly top3Weight: number;
  /** 1 / HHI — the effective number of equally-weighted positions. */
  readonly effectiveHoldings: number;
}

export interface PortfolioAnalytics {
  readonly marketValue: number;
  readonly costBasis: number;
  readonly unrealizedPnl: number;
  readonly unrealizedPnlPct: number;
  readonly positionsCount: number;
  /** Positions sorted by weight, descending. */
  readonly positions: readonly PositionAnalytics[];
  readonly byAssetClass: readonly AllocationSlice[];
  readonly bySector: readonly AllocationSlice[];
  readonly concentration: ConcentrationStats;
  /** Best / worst position by unrealized return; null when there are none. */
  readonly best: PositionAnalytics | null;
  readonly worst: PositionAnalytics | null;
}

export const PortfolioAnalyticsSchema = z.object({
  marketValue: z.number().finite(),
  costBasis: z.number().finite(),
  unrealizedPnl: z.number().finite(),
  unrealizedPnlPct: z.number().finite(),
  positionsCount: z.number().int().nonnegative(),
  positions: z.array(
    z.object({
      symbolId: z.string(),
      ticker: z.string(),
      quantity: z.number().finite(),
      avgCost: z.number().finite(),
      price: z.number().finite(),
      marketValue: z.number().finite(),
      costBasis: z.number().finite(),
      unrealizedPnl: z.number().finite(),
      unrealizedPnlPct: z.number().finite(),
      weight: z.number().finite(),
      pnlContribution: z.number().finite(),
    }),
  ),
  byAssetClass: z.array(
    z.object({ key: z.string(), marketValue: z.number().finite(), weight: z.number().finite() }),
  ),
  bySector: z.array(
    z.object({ key: z.string(), marketValue: z.number().finite(), weight: z.number().finite() }),
  ),
  concentration: z.object({
    hhi: z.number().finite(),
    topWeight: z.number().finite(),
    top3Weight: z.number().finite(),
    effectiveHoldings: z.number().finite(),
  }),
  best: z.unknown(),
  worst: z.unknown(),
});

const allocate = (
  positions: readonly PositionAnalytics[],
  totalMv: number,
  keyOf: (p: PositionAnalytics) => string,
): AllocationSlice[] => {
  const byKey = new Map<string, number>();
  for (const p of positions) byKey.set(keyOf(p), (byKey.get(keyOf(p)) ?? 0) + p.marketValue);
  return [...byKey.entries()]
    .map(([key, marketValue]) => ({
      key,
      marketValue,
      weight: totalMv > 0 ? marketValue / totalMv : 0,
    }))
    .sort((a, b) => b.marketValue - a.marketValue || a.key.localeCompare(b.key));
};

/**
 * Compute portfolio analytics from a set of priced positions. Pure and
 * deterministic — a function of the positions only. Weights are by market
 * value; allocations group by asset class and sector; concentration uses the
 * HHI of the weights.
 */
export const computePortfolioAnalytics = (
  positions: readonly AnalyticsPosition[],
): PortfolioAnalytics => {
  const enriched = positions.map((p) => {
    const marketValue = p.quantity * p.price;
    const costBasis = p.quantity * p.avgCost;
    const unrealizedPnl = marketValue - costBasis;
    return { p, marketValue, costBasis, unrealizedPnl };
  });

  const marketValue = enriched.reduce((s, e) => s + e.marketValue, 0);
  const costBasis = enriched.reduce((s, e) => s + e.costBasis, 0);
  const unrealizedPnl = marketValue - costBasis;

  const rows: PositionAnalytics[] = enriched
    .map(({ p, marketValue: mv, costBasis: cb, unrealizedPnl: pnl }) => ({
      symbolId: p.symbolId,
      ticker: p.ticker,
      quantity: p.quantity,
      avgCost: p.avgCost,
      price: p.price,
      marketValue: mv,
      costBasis: cb,
      unrealizedPnl: pnl,
      unrealizedPnlPct: cb > 0 ? pnl / cb : 0,
      weight: marketValue > 0 ? mv / marketValue : 0,
      pnlContribution: unrealizedPnl !== 0 ? pnl / unrealizedPnl : 0,
    }))
    .sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker));

  const hhi = rows.reduce((s, r) => s + r.weight * r.weight, 0);
  const top3Weight = rows.slice(0, 3).reduce((s, r) => s + r.weight, 0);

  let best: PositionAnalytics | null = null;
  let worst: PositionAnalytics | null = null;
  for (const r of rows) {
    if (!best || r.unrealizedPnlPct > best.unrealizedPnlPct) best = r;
    if (!worst || r.unrealizedPnlPct < worst.unrealizedPnlPct) worst = r;
  }

  return {
    marketValue,
    costBasis,
    unrealizedPnl,
    unrealizedPnlPct: costBasis > 0 ? unrealizedPnl / costBasis : 0,
    positionsCount: rows.length,
    positions: rows,
    byAssetClass: allocate(rows, marketValue, (p) => {
      const pos = positions.find((x) => x.symbolId === p.symbolId);
      return pos?.assetClass ?? 'unknown';
    }),
    bySector: allocate(rows, marketValue, (p) => {
      const pos = positions.find((x) => x.symbolId === p.symbolId);
      return pos?.sector ?? 'unknown';
    }),
    concentration: {
      hhi,
      topWeight: rows[0]?.weight ?? 0,
      top3Weight,
      effectiveHoldings: hhi > 0 ? 1 / hhi : 0,
    },
    best,
    worst,
  };
};
