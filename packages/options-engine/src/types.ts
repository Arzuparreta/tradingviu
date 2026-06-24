export type OptionType = 'call' | 'put';
export type OptionSide = 'long' | 'short';

/**
 * Black-Scholes greeks. All values are the canonical partial derivatives:
 * - `theta` is per year (divide by 365 for per-day)
 * - `vega` and `rho` are per 1.00 (100%) change in vol / rate (divide by 100 for per-1%)
 * The presentation layer scales these for traders; the engine stays mathematically pure.
 */
export interface Greeks {
  readonly delta: number;
  readonly gamma: number;
  readonly theta: number;
  readonly vega: number;
  readonly rho: number;
}

export interface BsInput {
  readonly type: OptionType;
  readonly spot: number;
  readonly strike: number;
  /** Time to expiry in years. */
  readonly timeToExpiry: number;
  /** Annual, continuously-compounded risk-free rate (e.g. 0.05). */
  readonly rate: number;
  /** Annualized volatility (e.g. 0.2 for 20%). */
  readonly volatility: number;
  /** Continuous dividend yield (defaults to 0). */
  readonly dividendYield?: number;
}
