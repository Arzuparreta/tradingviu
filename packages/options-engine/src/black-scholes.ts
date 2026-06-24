import type { BsInput, Greeks, OptionType } from './types.js';

const INV_SQRT_2PI = 0.3989422804014327;

/** Standard normal probability density. */
export const normPdf = (x: number): number => INV_SQRT_2PI * Math.exp(-0.5 * x * x);

/**
 * Standard normal CDF via Abramowitz & Stegun 26.2.17 (|error| < 7.5e-8).
 * Accurate enough for option pricing without pulling in a stats dependency.
 */
export const normCdf = (x: number): number => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - normPdf(x) * poly;
  return x >= 0 ? cdf : 1 - cdf;
};

export const intrinsicValue = (type: OptionType, spot: number, strike: number): number =>
  type === 'call' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);

interface DPair {
  readonly d1: number;
  readonly d2: number;
  readonly sqrtT: number;
}

const computeD = (i: BsInput): DPair => {
  const q = i.dividendYield ?? 0;
  const sqrtT = Math.sqrt(i.timeToExpiry);
  const d1 =
    (Math.log(i.spot / i.strike) + (i.rate - q + 0.5 * i.volatility * i.volatility) * i.timeToExpiry) /
    (i.volatility * sqrtT);
  const d2 = d1 - i.volatility * sqrtT;
  return { d1, d2, sqrtT };
};

/** Black-Scholes-Merton price for a European call/put with continuous dividend yield. */
export const optionPrice = (i: BsInput): number => {
  if (i.timeToExpiry <= 0 || i.volatility <= 0) return intrinsicValue(i.type, i.spot, i.strike);
  const q = i.dividendYield ?? 0;
  const { d1, d2 } = computeD(i);
  const dfR = Math.exp(-i.rate * i.timeToExpiry);
  const dfQ = Math.exp(-q * i.timeToExpiry);
  if (i.type === 'call') return i.spot * dfQ * normCdf(d1) - i.strike * dfR * normCdf(d2);
  return i.strike * dfR * normCdf(-d2) - i.spot * dfQ * normCdf(-d1);
};

/** Full greek set for a European option. See {@link Greeks} for units. */
export const optionGreeks = (i: BsInput): Greeks => {
  if (i.timeToExpiry <= 0 || i.volatility <= 0) {
    const itm = intrinsicValue(i.type, i.spot, i.strike) > 0;
    const delta = i.type === 'call' ? (itm ? 1 : 0) : itm ? -1 : 0;
    return { delta, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const q = i.dividendYield ?? 0;
  const { d1, d2, sqrtT } = computeD(i);
  const dfR = Math.exp(-i.rate * i.timeToExpiry);
  const dfQ = Math.exp(-q * i.timeToExpiry);
  const pdfD1 = normPdf(d1);
  const gamma = (dfQ * pdfD1) / (i.spot * i.volatility * sqrtT);
  const vega = i.spot * dfQ * pdfD1 * sqrtT;
  if (i.type === 'call') {
    const delta = dfQ * normCdf(d1);
    const theta =
      -(i.spot * dfQ * pdfD1 * i.volatility) / (2 * sqrtT) -
      i.rate * i.strike * dfR * normCdf(d2) +
      q * i.spot * dfQ * normCdf(d1);
    const rho = i.strike * i.timeToExpiry * dfR * normCdf(d2);
    return { delta, gamma, theta, vega, rho };
  }
  const delta = dfQ * (normCdf(d1) - 1);
  const theta =
    -(i.spot * dfQ * pdfD1 * i.volatility) / (2 * sqrtT) +
    i.rate * i.strike * dfR * normCdf(-d2) -
    q * i.spot * dfQ * normCdf(-d1);
  const rho = -i.strike * i.timeToExpiry * dfR * normCdf(-d2);
  return { delta, gamma, theta, vega, rho };
};

/**
 * Implied volatility via bisection (robust, monotone in vol). Returns 0 when the
 * market price has no extrinsic value (at/below intrinsic) — i.e. IV is undefined.
 */
export const impliedVolatility = (
  marketPrice: number,
  params: Omit<BsInput, 'volatility'>,
  opts: { tolerance?: number; maxIter?: number } = {},
): number => {
  const tol = opts.tolerance ?? 1e-6;
  const maxIter = opts.maxIter ?? 128;
  if (marketPrice <= intrinsicValue(params.type, params.spot, params.strike)) return 0;
  let lo = 1e-4;
  let hi = 5;
  let mid = 0.5 * (lo + hi);
  for (let k = 0; k < maxIter; k++) {
    mid = 0.5 * (lo + hi);
    const diff = optionPrice({ ...params, volatility: mid }) - marketPrice;
    if (Math.abs(diff) < tol) return mid;
    if (diff > 0) hi = mid;
    else lo = mid;
  }
  return mid;
};
