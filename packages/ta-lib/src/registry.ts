import { z } from 'zod';
import type { Bar } from '@tv/data-types';
import type { IndicatorDefinition, IndicatorOutput } from './types.js';
import { sma, ema, wma, vwap, bollingerBands, keltnerChannels, donchianChannels } from './overlap.js';
import { rsi, macd, stochastic, cci, roc, williamsR, mfi, ao, ultimateOscillator } from './momentum.js';
import { atr, bollingerWidth, stddev, historicalVolatility, ulcerIndex, trueRange } from './volatility.js';
import { obv, cmf, ad, pvt, nvi } from './volume.js';
import { adx, aroon, psar, supertrend, ichimoku } from './trend.js';

interface IndicatorSpec {
  definition: IndicatorDefinition<Record<string, number>>;
  defaults: Record<string, number>;
  minBars: number;
  fn: (bars: ReadonlyArray<Bar>, params: Record<string, number>) => IndicatorOutput;
}

const wrap = (
  name: string,
  category: IndicatorDefinition['category'],
  overlay: boolean,
  paramsSchema: z.ZodTypeAny,
  defaults: Record<string, number>,
  minBars: number,
  fn: (bars: ReadonlyArray<Bar>, params: Record<string, number>) => IndicatorOutput,
): IndicatorSpec => ({
  definition: {
    name,
    category,
    overlay,
    paramsSchema: paramsSchema as IndicatorDefinition['paramsSchema'],
    defaults,
    minBars,
    compute: fn as IndicatorDefinition['compute'],
  },
  defaults,
  minBars,
  fn,
});

const SCHEMAS: Record<string, z.ZodTypeAny> = {
  sma: z.object({ length: z.number().int().min(1).max(500).default(20) }),
  ema: z.object({ length: z.number().int().min(1).max(500).default(20) }),
  wma: z.object({ length: z.number().int().min(1).max(500).default(20) }),
  vwap: z.object({}),
  bb: z.object({ length: z.number().int().min(2).max(200).default(20), mult: z.number().min(0.5).max(5).default(2) }),
  keltner: z.object({ length: z.number().int().min(1).max(100).default(20), mult: z.number().min(0.5).max(5).default(2) }),
  donchian: z.object({ length: z.number().int().min(1).max(200).default(20) }),
  rsi: z.object({ length: z.number().int().min(2).max(200).default(14) }),
  macd: z.object({ fast: z.number().int().min(2).max(100).default(12), slow: z.number().int().min(2).max(200).default(26), signal: z.number().int().min(2).max(100).default(9) }),
  stoch: z.object({ k: z.number().int().min(1).max(100).default(14), d: z.number().int().min(1).max(100).default(3), smooth: z.number().int().min(1).max(50).default(3) }),
  cci: z.object({ length: z.number().int().min(1).max(200).default(20) }),
  roc: z.object({ length: z.number().int().min(1).max(200).default(10) }),
  williams: z.object({ length: z.number().int().min(1).max(200).default(14) }),
  mfi: z.object({ length: z.number().int().min(1).max(200).default(14) }),
  ao: z.object({ fast: z.number().int().min(2).max(50).default(5), slow: z.number().int().min(2).max(100).default(34) }),
  uo: z.object({ p1: z.number().int().min(1).max(100).default(7), p2: z.number().int().min(1).max(100).default(14), p3: z.number().int().min(1).max(100).default(28) }),
  atr: z.object({ length: z.number().int().min(1).max(200).default(14) }),
  tr: z.object({}),
  bbw: z.object({ length: z.number().int().min(2).max(200).default(20), mult: z.number().min(0.5).max(5).default(2) }),
  stddev: z.object({ length: z.number().int().min(1).max(200).default(20) }),
  hv: z.object({ length: z.number().int().min(1).max(200).default(20) }),
  ui: z.object({ length: z.number().int().min(1).max(200).default(14) }),
  obv: z.object({}),
  cmf: z.object({ length: z.number().int().min(1).max(200).default(20) }),
  ad: z.object({}),
  pvt: z.object({}),
  nvi: z.object({}),
  adx: z.object({ length: z.number().int().min(1).max(100).default(14) }),
  aroon: z.object({ length: z.number().int().min(1).max(200).default(25) }),
  psar: z.object({ step: z.number().min(0.001).max(0.5).default(0.02), max: z.number().min(0.05).max(1).default(0.2) }),
  supertrend: z.object({ length: z.number().int().min(1).max(100).default(10), mult: z.number().min(0.5).max(10).default(3) }),
  ichimoku: z.object({ tenkan: z.number().int().min(1).max(100).default(9), kijun: z.number().int().min(1).max(200).default(26), senkou: z.number().int().min(1).max(300).default(52) }),
};

const SPECS: IndicatorSpec[] = [
  wrap('SMA', 'overlap', true, SCHEMAS.sma!, { length: 20 }, 20, (b, p) => sma(b, p.length!)),
  wrap('EMA', 'overlap', true, SCHEMAS.ema!, { length: 20 }, 20, (b, p) => ema(b, p.length!)),
  wrap('WMA', 'overlap', true, SCHEMAS.wma!, { length: 20 }, 20, (b, p) => wma(b, p.length!)),
  wrap('VWAP', 'overlap', true, SCHEMAS.vwap!, {}, 1, (b) => vwap(b)),
  wrap('BB', 'overlap', true, SCHEMAS.bb!, { length: 20, mult: 2 }, 20, (b, p) => bollingerBands(b, p.length!, p.mult!)),
  wrap('KC', 'overlap', true, SCHEMAS.keltner!, { length: 20, mult: 2 }, 20, (b, p) => keltnerChannels(b, p.length!, p.mult!)),
  wrap('DC', 'overlap', true, SCHEMAS.donchian!, { length: 20 }, 20, (b, p) => donchianChannels(b, p.length!)),

  wrap('RSI', 'momentum', false, SCHEMAS.rsi!, { length: 14 }, 15, (b, p) => rsi(b, p.length!)),
  wrap('MACD', 'momentum', false, SCHEMAS.macd!, { fast: 12, slow: 26, signal: 9 }, 35, (b, p) => macd(b, p.fast!, p.slow!, p.signal!)),
  wrap('Stoch', 'momentum', false, SCHEMAS.stoch!, { k: 14, d: 3, smooth: 3 }, 20, (b, p) => stochastic(b, p.k!, p.d!, p.smooth!)),
  wrap('CCI', 'momentum', false, SCHEMAS.cci!, { length: 20 }, 20, (b, p) => cci(b, p.length!)),
  wrap('ROC', 'momentum', false, SCHEMAS.roc!, { length: 10 }, 11, (b, p) => roc(b, p.length!)),
  wrap('Williams %R', 'momentum', false, SCHEMAS.williams!, { length: 14 }, 14, (b, p) => williamsR(b, p.length!)),
  wrap('MFI', 'momentum', false, SCHEMAS.mfi!, { length: 14 }, 15, (b, p) => mfi(b, p.length!)),
  wrap('AO', 'momentum', false, SCHEMAS.ao!, { fast: 5, slow: 34 }, 35, (b, p) => ao(b, p.fast!, p.slow!)),
  wrap('UO', 'momentum', false, SCHEMAS.uo!, { p1: 7, p2: 14, p3: 28 }, 30, (b, p) => ultimateOscillator(b, p.p1!, p.p2!, p.p3!)),

  wrap('ATR', 'volatility', false, SCHEMAS.atr!, { length: 14 }, 15, (b, p) => atr(b, p.length!)),
  wrap('TR', 'volatility', false, SCHEMAS.tr!, {}, 2, (b) => trueRange(b)),
  wrap('BBW', 'volatility', false, SCHEMAS.bbw!, { length: 20, mult: 2 }, 20, (b, p) => bollingerWidth(b, p.length!, p.mult!)),
  wrap('StdDev', 'volatility', false, SCHEMAS.stddev!, { length: 20 }, 20, (b, p) => stddev(b, p.length!)),
  wrap('HV', 'volatility', false, SCHEMAS.hv!, { length: 20 }, 21, (b, p) => historicalVolatility(b, p.length!)),
  wrap('UI', 'volatility', false, SCHEMAS.ui!, { length: 14 }, 14, (b, p) => ulcerIndex(b, p.length!)),

  wrap('OBV', 'volume', false, SCHEMAS.obv!, {}, 2, (b) => obv(b)),
  wrap('CMF', 'volume', false, SCHEMAS.cmf!, { length: 20 }, 20, (b, p) => cmf(b, p.length!)),
  wrap('AD', 'volume', false, SCHEMAS.ad!, {}, 1, (b) => ad(b)),
  wrap('PVT', 'volume', false, SCHEMAS.pvt!, {}, 2, (b) => pvt(b)),
  wrap('NVI', 'volume', false, SCHEMAS.nvi!, {}, 2, (b) => nvi(b)),

  wrap('ADX', 'trend', false, SCHEMAS.adx!, { length: 14 }, 30, (b, p) => adx(b, p.length!)),
  wrap('Aroon', 'trend', false, SCHEMAS.aroon!, { length: 25 }, 25, (b, p) => aroon(b, p.length!)),
  wrap('PSAR', 'trend', true, SCHEMAS.psar!, { step: 0.02, max: 0.2 }, 2, (b, p) => psar(b, p.step!, p.max!)),
  wrap('Supertrend', 'trend', true, SCHEMAS.supertrend!, { length: 10, mult: 3 }, 15, (b, p) => supertrend(b, p.length!, p.mult!)),
  wrap('Ichimoku', 'trend', true, SCHEMAS.ichimoku!, { tenkan: 9, kijun: 26, senkou: 52 }, 80, (b, p) => ichimoku(b, p.tenkan!, p.kijun!, p.senkou!)),
];

const BY_ID = new Map(SPECS.map((s) => [s.definition.name.toLowerCase().replace(/[^a-z0-9]/g, ''), s]));

export const all = (): IndicatorDefinition<Record<string, number>>[] =>
  SPECS.map((s) => s.definition);

export const find = (id: string): IndicatorDefinition<Record<string, number>> | undefined => {
  const key = id.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BY_ID.get(key)?.definition;
};

export const compute = (
  id: string,
  bars: ReadonlyArray<Bar>,
  params: Record<string, number> = {},
): IndicatorOutput => {
  const spec = BY_ID.get(id.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (!spec) throw new Error(`Unknown indicator: ${id}`);
  const merged = { ...spec.defaults, ...params };
  const validated = spec.definition.paramsSchema.parse(merged) as Record<string, number>;
  return spec.fn(bars, validated);
};
