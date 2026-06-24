import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { AnalyzeStrategySchema, OptionChainSchema, PriceOptionSchema } from '@tv/core';
import {
  analyzeStrategy,
  buildChain,
  buildStrategy,
  intrinsicValue,
  optionGreeks,
  optionPrice,
  priceLeg,
  type ChainInput,
  type PricedLeg,
  type StrategyContext,
  type StrategyLeg,
} from '@tv/options-engine';

export const optionsRoutes = new Hono()
  .post('/options/price', zValidator('json', PriceOptionSchema), (c) => {
    const b = c.req.valid('json');
    const input = {
      type: b.type,
      spot: b.spot,
      strike: b.strike,
      timeToExpiry: b.timeToExpiry,
      rate: b.rate,
      volatility: b.volatility,
      dividendYield: b.dividendYield,
    };
    const price = optionPrice(input);
    const intrinsic = intrinsicValue(b.type, b.spot, b.strike);
    return c.json({ price, intrinsic, extrinsic: Math.max(price - intrinsic, 0), greeks: optionGreeks(input) });
  })
  .post('/options/chain', zValidator('json', OptionChainSchema), (c) => {
    const b = c.req.valid('json');
    const input: ChainInput = {
      spot: b.spot,
      expiries: b.expiries,
      rate: b.rate,
      volatility: b.volatility,
      dividendYield: b.dividendYield,
      strikeCount: b.strikeCount,
      ...(b.strikes !== undefined ? { strikes: b.strikes } : {}),
      ...(b.strikeStep !== undefined ? { strikeStep: b.strikeStep } : {}),
    };
    return c.json({ chain: buildChain(input) });
  })
  .post('/options/strategy', zValidator('json', AnalyzeStrategySchema), (c) => {
    const b = c.req.valid('json');
    const ctx: StrategyContext = {
      spot: b.spot,
      rate: b.rate,
      volatility: b.volatility,
      timeToExpiry: b.timeToExpiry,
      dividendYield: b.dividendYield,
      contracts: b.contracts,
      ...(b.width !== undefined ? { width: b.width } : {}),
    };

    const legs: PricedLeg[] = b.template
      ? buildStrategy(b.template, ctx).map((l) => priceLeg(l, ctx))
      : (b.legs ?? []).map((input) => {
          const l: StrategyLeg = {
            type: input.type,
            side: input.side,
            strike: input.strike,
            quantity: input.quantity,
            expiry: input.expiry ?? b.timeToExpiry,
          };
          const priced = priceLeg(l, ctx);
          return input.premium !== undefined ? { ...priced, premium: input.premium } : priced;
        });

    const analysis = analyzeStrategy(legs, {
      ...(b.priceMin !== undefined ? { priceMin: b.priceMin } : {}),
      ...(b.priceMax !== undefined ? { priceMax: b.priceMax } : {}),
      ...(b.steps !== undefined ? { steps: b.steps } : {}),
    });
    // JSON cannot represent Infinity (it becomes null) — surface unbounded tails as flags.
    return c.json({
      ...analysis,
      maxProfit: Number.isFinite(analysis.maxProfit) ? analysis.maxProfit : null,
      maxLoss: Number.isFinite(analysis.maxLoss) ? analysis.maxLoss : null,
      unlimitedProfit: analysis.maxProfit === Infinity,
      unlimitedLoss: analysis.maxLoss === -Infinity,
    });
  });
