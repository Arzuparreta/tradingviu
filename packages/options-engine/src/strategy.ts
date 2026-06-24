import { intrinsicValue, optionGreeks, optionPrice } from './black-scholes.js';
import type { Greeks, OptionSide, OptionType } from './types.js';

export interface StrategyLeg {
  readonly type: OptionType;
  readonly side: OptionSide;
  readonly strike: number;
  readonly quantity: number;
  /** Time to expiry in years. */
  readonly expiry: number;
}

export interface PricedLeg extends StrategyLeg {
  readonly premium: number;
  readonly greeks: Greeks;
}

export interface PayoffPoint {
  readonly price: number;
  readonly pnl: number;
}

export interface StrategyAnalysis {
  readonly legs: PricedLeg[];
  /** Net cash flow at entry: > 0 means a net debit paid, < 0 a net credit received. */
  readonly netDebit: number;
  readonly netGreeks: Greeks;
  readonly payoff: PayoffPoint[];
  /** May be Infinity for strategies with unlimited upside. */
  readonly maxProfit: number;
  /** May be -Infinity for strategies with unlimited downside. */
  readonly maxLoss: number;
  readonly breakevens: number[];
}

export interface StrategyContext {
  readonly spot: number;
  readonly rate: number;
  readonly volatility: number;
  /** Default time to expiry (years) for template legs. */
  readonly timeToExpiry: number;
  readonly dividendYield?: number;
  /** Strike spacing for spreads/condors/butterflies. */
  readonly width?: number;
  /** Base contract quantity per leg. */
  readonly contracts?: number;
}

export type StrategyTemplate =
  | 'long_call'
  | 'long_put'
  | 'short_call'
  | 'short_put'
  | 'bull_call_spread'
  | 'bear_call_spread'
  | 'bull_put_spread'
  | 'bear_put_spread'
  | 'straddle'
  | 'strangle'
  | 'iron_condor'
  | 'iron_butterfly'
  | 'call_butterfly';

const round = (x: number, dp = 6): number => {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};

const defaultWidth = (ctx: StrategyContext): number => ctx.width ?? Math.max(round(ctx.spot * 0.05, 2), 1);

const leg = (
  type: OptionType,
  side: OptionSide,
  strike: number,
  ctx: StrategyContext,
  qtyMul = 1,
): StrategyLeg => ({
  type,
  side,
  strike,
  quantity: (ctx.contracts ?? 1) * qtyMul,
  expiry: ctx.timeToExpiry,
});

const TEMPLATES: Record<StrategyTemplate, (ctx: StrategyContext) => StrategyLeg[]> = {
  long_call: (c) => [leg('call', 'long', c.spot, c)],
  long_put: (c) => [leg('put', 'long', c.spot, c)],
  short_call: (c) => [leg('call', 'short', c.spot, c)],
  short_put: (c) => [leg('put', 'short', c.spot, c)],
  bull_call_spread: (c) => [leg('call', 'long', c.spot, c), leg('call', 'short', c.spot + defaultWidth(c), c)],
  bear_call_spread: (c) => [leg('call', 'short', c.spot, c), leg('call', 'long', c.spot + defaultWidth(c), c)],
  bull_put_spread: (c) => [leg('put', 'short', c.spot, c), leg('put', 'long', c.spot - defaultWidth(c), c)],
  bear_put_spread: (c) => [leg('put', 'long', c.spot, c), leg('put', 'short', c.spot - defaultWidth(c), c)],
  straddle: (c) => [leg('call', 'long', c.spot, c), leg('put', 'long', c.spot, c)],
  strangle: (c) => [leg('call', 'long', c.spot + defaultWidth(c), c), leg('put', 'long', c.spot - defaultWidth(c), c)],
  iron_condor: (c) => {
    const w = defaultWidth(c);
    return [
      leg('put', 'short', c.spot - w, c),
      leg('put', 'long', c.spot - 2 * w, c),
      leg('call', 'short', c.spot + w, c),
      leg('call', 'long', c.spot + 2 * w, c),
    ];
  },
  iron_butterfly: (c) => {
    const w = defaultWidth(c);
    return [
      leg('call', 'short', c.spot, c),
      leg('put', 'short', c.spot, c),
      leg('call', 'long', c.spot + w, c),
      leg('put', 'long', c.spot - w, c),
    ];
  },
  call_butterfly: (c) => {
    const w = defaultWidth(c);
    return [
      leg('call', 'long', c.spot - w, c),
      leg('call', 'short', c.spot, c, 2),
      leg('call', 'long', c.spot + w, c),
    ];
  },
};

export const buildStrategy = (template: StrategyTemplate, ctx: StrategyContext): StrategyLeg[] =>
  TEMPLATES[template](ctx);

/** Price a leg with Black-Scholes, attaching its premium and greeks. */
export const priceLeg = (l: StrategyLeg, ctx: StrategyContext): PricedLeg => {
  const input = {
    type: l.type,
    spot: ctx.spot,
    strike: l.strike,
    timeToExpiry: l.expiry,
    rate: ctx.rate,
    volatility: ctx.volatility,
    dividendYield: ctx.dividendYield ?? 0,
  };
  return { ...l, premium: optionPrice(input), greeks: optionGreeks(input) };
};

const sign = (side: OptionSide): number => (side === 'long' ? 1 : -1);

const legPnlAtExpiry = (l: PricedLeg, price: number): number =>
  sign(l.side) * (intrinsicValue(l.type, price, l.strike) - l.premium) * l.quantity;

export const netGreeks = (legs: PricedLeg[]): Greeks => {
  const acc = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  for (const l of legs) {
    const s = sign(l.side) * l.quantity;
    acc.delta += s * l.greeks.delta;
    acc.gamma += s * l.greeks.gamma;
    acc.theta += s * l.greeks.theta;
    acc.vega += s * l.greeks.vega;
    acc.rho += s * l.greeks.rho;
  }
  return {
    delta: round(acc.delta),
    gamma: round(acc.gamma),
    theta: round(acc.theta),
    vega: round(acc.vega),
    rho: round(acc.rho),
  };
};

export interface AnalyzeOptions {
  readonly priceMin?: number;
  readonly priceMax?: number;
  readonly steps?: number;
}

/** Compute payoff curve, net greeks, max profit/loss and breakevens for a set of priced legs. */
export const analyzeStrategy = (legs: PricedLeg[], opts: AnalyzeOptions = {}): StrategyAnalysis => {
  const steps = Math.max(2, opts.steps ?? 81);
  const strikes = legs.map((l) => l.strike);
  const topStrike = Math.max(...strikes);
  const priceMin = Math.max(0, opts.priceMin ?? 0);
  const priceMax = opts.priceMax ?? topStrike * 1.5;
  const dP = (priceMax - priceMin) / (steps - 1);

  const payoff: PayoffPoint[] = [];
  for (let k = 0; k < steps; k++) {
    const price = priceMin + k * dP;
    let pnl = 0;
    for (const l of legs) pnl += legPnlAtExpiry(l, price);
    payoff.push({ price: round(price), pnl: round(pnl) });
  }

  const netDebit = round(legs.reduce((sum, l) => sum + sign(l.side) * l.premium * l.quantity, 0));

  const pnls = payoff.map((p) => p.pnl);
  let maxProfit = Math.max(...pnls);
  let maxLoss = Math.min(...pnls);

  // Detect unbounded tails from the slope at the right edge (price -> infinity).
  // The left edge is naturally bounded because price cannot go below 0.
  const last = payoff[payoff.length - 1];
  const prev = payoff[payoff.length - 2];
  if (last && prev) {
    const rightSlope = last.pnl - prev.pnl;
    const eps = 1e-6;
    if (rightSlope > eps) maxProfit = Infinity;
    if (rightSlope < -eps) maxLoss = -Infinity;
  }

  const breakevens: number[] = [];
  for (let k = 1; k < payoff.length; k++) {
    const a = payoff[k - 1];
    const b = payoff[k];
    if (!a || !b) continue;
    const crossesUp = a.pnl <= 0 && b.pnl > 0;
    const crossesDown = a.pnl >= 0 && b.pnl < 0;
    if (crossesUp || crossesDown) {
      const t = a.pnl / (a.pnl - b.pnl);
      breakevens.push(round(a.price + t * (b.price - a.price), 4));
    }
  }

  return { legs, netDebit, netGreeks: netGreeks(legs), payoff, maxProfit, maxLoss, breakevens };
};

/** Convenience: build a template, price every leg, and analyze it in one call. */
export const buildAndAnalyze = (
  template: StrategyTemplate,
  ctx: StrategyContext,
  opts: AnalyzeOptions = {},
): StrategyAnalysis => analyzeStrategy(buildStrategy(template, ctx).map((l) => priceLeg(l, ctx)), opts);
