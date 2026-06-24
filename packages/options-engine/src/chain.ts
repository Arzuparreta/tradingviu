import { intrinsicValue, optionGreeks, optionPrice } from './black-scholes.js';
import type { Greeks, OptionType } from './types.js';

export interface ChainQuote {
  readonly price: number;
  readonly intrinsic: number;
  readonly extrinsic: number;
  readonly greeks: Greeks;
}

export interface ChainStrike {
  readonly strike: number;
  readonly call: ChainQuote;
  readonly put: ChainQuote;
}

export interface ChainExpiry {
  /** Time to expiry in years. */
  readonly expiry: number;
  readonly strikes: ChainStrike[];
}

export interface ChainInput {
  readonly spot: number;
  /** Expiries in years. */
  readonly expiries: number[];
  readonly rate: number;
  readonly volatility: number;
  readonly dividendYield?: number;
  /** Explicit strikes. When omitted, strikes are generated around the spot. */
  readonly strikes?: number[];
  readonly strikeStep?: number;
  readonly strikeCount?: number;
}

/** A "nice" strike increment (~2.5% of spot, snapped to 1/2.5/5/10 × power of ten). */
const niceStep = (spot: number): number => {
  const raw = spot * 0.025;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm < 1.5 ? 1 : norm < 3.5 ? 2.5 : norm < 7.5 ? 5 : 10;
  return nice * mag;
};

const buildStrikes = (input: ChainInput): number[] => {
  if (input.strikes && input.strikes.length > 0) {
    return [...input.strikes].sort((a, b) => a - b);
  }
  const step = input.strikeStep ?? niceStep(input.spot);
  const count = input.strikeCount ?? 11;
  const center = Math.round(input.spot / step) * step;
  const half = Math.floor(count / 2);
  const out: number[] = [];
  for (let k = -half; k <= half; k++) {
    const strike = Number((center + k * step).toFixed(8));
    if (strike > 0) out.push(strike);
  }
  return out;
};

const quote = (
  type: OptionType,
  spot: number,
  strike: number,
  timeToExpiry: number,
  rate: number,
  volatility: number,
  dividendYield: number,
): ChainQuote => {
  const input = { type, spot, strike, timeToExpiry, rate, volatility, dividendYield };
  const price = optionPrice(input);
  const intrinsic = intrinsicValue(type, spot, strike);
  return { price, intrinsic, extrinsic: Math.max(price - intrinsic, 0), greeks: optionGreeks(input) };
};

/** Build a full call/put option chain for each requested expiry. */
export const buildChain = (input: ChainInput): ChainExpiry[] => {
  const q = input.dividendYield ?? 0;
  const strikes = buildStrikes(input);
  return input.expiries.map((expiry) => ({
    expiry,
    strikes: strikes.map((strike) => ({
      strike,
      call: quote('call', input.spot, strike, expiry, input.rate, input.volatility, q),
      put: quote('put', input.spot, strike, expiry, input.rate, input.volatility, q),
    })),
  }));
};
