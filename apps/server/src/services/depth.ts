import { DomBookSchema, type DomBook, type DomLevel } from '@tv/core';

export interface BuildDomInput {
  readonly lastPrice: number;
  readonly high: number;
  readonly low: number;
  readonly volume: number;
  readonly levels?: number;
  readonly tickSize?: number;
  readonly spreadBps?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const estimateTickSize = (price: number): number => {
  if (price >= 10_000) return 1;
  if (price >= 1_000) return 0.5;
  if (price >= 100) return 0.05;
  if (price >= 10) return 0.01;
  if (price >= 1) return 0.001;
  return 0.0001;
};

const roundToTick = (price: number, tickSize: number): number => {
  const decimals = Math.max(0, Math.ceil(Math.log10(1 / tickSize)));
  return Number((Math.round(price / tickSize) * tickSize).toFixed(decimals + 2));
};

const buildSide = (opts: {
  readonly side: 'bid' | 'ask';
  readonly start: number;
  readonly tickSize: number;
  readonly levels: number;
  readonly baseSize: number;
  readonly volatilitySkew: number;
}): DomLevel[] => {
  let cumulative = 0;
  return Array.from({ length: opts.levels }, (_, index) => {
    const level = index + 1;
    const direction = opts.side === 'bid' ? -1 : 1;
    const price = roundToTick(opts.start + direction * index * opts.tickSize, opts.tickSize);
    const wall = level % 5 === 0 ? 1.8 : 1;
    const size = Number(
      (opts.baseSize * (1 + level * 0.12) * wall * opts.volatilitySkew).toFixed(6),
    );
    cumulative = Number((cumulative + size).toFixed(6));
    return { price, size, cumulative };
  });
};

export const buildDomBook = (input: BuildDomInput): DomBook => {
  const levels = input.levels ?? 16;
  const tickSize = input.tickSize ?? estimateTickSize(input.lastPrice);
  const range = Math.max(input.high - input.low, tickSize);
  const rangeBps = (range / input.lastPrice) * 10_000;
  const spreadBps = input.spreadBps ?? clamp(rangeBps / 20, 1, 20);
  const rawSpread = Math.max(input.lastPrice * (spreadBps / 10_000), tickSize);
  const spreadTicks = Math.max(1, Math.ceil(rawSpread / tickSize));
  const spread = spreadTicks * tickSize;
  const bidStart = roundToTick(input.lastPrice - spread / 2, tickSize);
  const askStart = roundToTick(input.lastPrice + spread / 2, tickSize);
  const baseSize = Math.max(input.volume / Math.max(levels * 50, 1), 1);
  const closeLocation = clamp((input.lastPrice - input.low) / range, 0, 1);
  const bidSkew = 0.85 + (1 - closeLocation) * 0.35;
  const askSkew = 0.85 + closeLocation * 0.35;

  const bids = buildSide({
    side: 'bid',
    start: bidStart,
    tickSize,
    levels,
    baseSize,
    volatilitySkew: bidSkew,
  });
  const asks = buildSide({
    side: 'ask',
    start: askStart,
    tickSize,
    levels,
    baseSize,
    volatilitySkew: askSkew,
  });
  const bidDepth = bids.at(-1)?.cumulative ?? 0;
  const askDepth = asks.at(-1)?.cumulative ?? 0;
  const imbalance = bidDepth + askDepth === 0 ? 0 : (bidDepth - askDepth) / (bidDepth + askDepth);

  return DomBookSchema.parse({
    mid: input.lastPrice,
    spread,
    tickSize,
    bids,
    asks,
    imbalance,
    generatedAt: new Date(),
  });
};
