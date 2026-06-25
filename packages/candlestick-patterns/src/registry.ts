import type { Bar } from '@tv/data-types';
import type { PatternDefinition, PatternMatch, PatternCatalogEntry } from './types.js';
import {
  doji,
  marubozuBull,
  marubozuBear,
  spinningTop,
  hammer,
  hangingMan,
  invertedHammer,
  shootingStar,
} from './single.js';
import {
  bullishEngulfing,
  bearishEngulfing,
  bullishHarami,
  bearishHarami,
  piercingLine,
  darkCloudCover,
  tweezerBottom,
  tweezerTop,
} from './double.js';
import {
  morningStar,
  eveningStar,
  threeWhiteSoldiers,
  threeBlackCrows,
  threeInsideUp,
  threeInsideDown,
} from './triple.js';

const def = (
  id: string,
  name: string,
  kind: PatternDefinition['kind'],
  direction: PatternDefinition['direction'],
  bars: number,
  description: string,
  detect: PatternDefinition['detect'],
): PatternDefinition => ({ id, name, kind, direction, bars, description, detect });

export const PATTERNS: readonly PatternDefinition[] = [
  // Single-bar
  def(
    'doji',
    'Doji',
    'single',
    'neutral',
    1,
    'Open and close are nearly equal — indecision.',
    doji,
  ),
  def(
    'marubozu-bull',
    'Bullish Marubozu',
    'single',
    'bullish',
    1,
    'Full-body up bar with no shadows — strong buying.',
    marubozuBull,
  ),
  def(
    'marubozu-bear',
    'Bearish Marubozu',
    'single',
    'bearish',
    1,
    'Full-body down bar with no shadows — strong selling.',
    marubozuBear,
  ),
  def(
    'spinning-top',
    'Spinning Top',
    'single',
    'neutral',
    1,
    'Small body between long shadows — indecision.',
    spinningTop,
  ),
  def(
    'hammer',
    'Hammer',
    'single',
    'bullish',
    1,
    'Long lower shadow after a downtrend — bullish reversal.',
    hammer,
  ),
  def(
    'hanging-man',
    'Hanging Man',
    'single',
    'bearish',
    1,
    'Long lower shadow after an uptrend — bearish reversal.',
    hangingMan,
  ),
  def(
    'inverted-hammer',
    'Inverted Hammer',
    'single',
    'bullish',
    1,
    'Long upper shadow after a downtrend — bullish reversal.',
    invertedHammer,
  ),
  def(
    'shooting-star',
    'Shooting Star',
    'single',
    'bearish',
    1,
    'Long upper shadow after an uptrend — bearish reversal.',
    shootingStar,
  ),

  // Two-bar
  def(
    'bullish-engulfing',
    'Bullish Engulfing',
    'double',
    'bullish',
    2,
    'Up bar engulfs the prior down bar after a downtrend.',
    bullishEngulfing,
  ),
  def(
    'bearish-engulfing',
    'Bearish Engulfing',
    'double',
    'bearish',
    2,
    'Down bar engulfs the prior up bar after an uptrend.',
    bearishEngulfing,
  ),
  def(
    'bullish-harami',
    'Bullish Harami',
    'double',
    'bullish',
    2,
    'Small up bar inside a large prior down bar after a downtrend.',
    bullishHarami,
  ),
  def(
    'bearish-harami',
    'Bearish Harami',
    'double',
    'bearish',
    2,
    'Small down bar inside a large prior up bar after an uptrend.',
    bearishHarami,
  ),
  def(
    'piercing-line',
    'Piercing Line',
    'double',
    'bullish',
    2,
    'Up bar closes back above the midpoint of the prior down bar.',
    piercingLine,
  ),
  def(
    'dark-cloud-cover',
    'Dark Cloud Cover',
    'double',
    'bearish',
    2,
    'Down bar closes back below the midpoint of the prior up bar.',
    darkCloudCover,
  ),
  def(
    'tweezer-bottom',
    'Tweezer Bottom',
    'double',
    'bullish',
    2,
    'Two bars share a low after a downtrend — bullish reversal.',
    tweezerBottom,
  ),
  def(
    'tweezer-top',
    'Tweezer Top',
    'double',
    'bearish',
    2,
    'Two bars share a high after an uptrend — bearish reversal.',
    tweezerTop,
  ),

  // Three-bar
  def(
    'morning-star',
    'Morning Star',
    'triple',
    'bullish',
    3,
    'Down bar, small star, then a strong up bar — bottom reversal.',
    morningStar,
  ),
  def(
    'evening-star',
    'Evening Star',
    'triple',
    'bearish',
    3,
    'Up bar, small star, then a strong down bar — top reversal.',
    eveningStar,
  ),
  def(
    'three-white-soldiers',
    'Three White Soldiers',
    'triple',
    'bullish',
    3,
    'Three rising up bars — sustained bullish momentum.',
    threeWhiteSoldiers,
  ),
  def(
    'three-black-crows',
    'Three Black Crows',
    'triple',
    'bearish',
    3,
    'Three falling down bars — sustained bearish momentum.',
    threeBlackCrows,
  ),
  def(
    'three-inside-up',
    'Three Inside Up',
    'triple',
    'bullish',
    3,
    'Bullish harami confirmed by a third up bar.',
    threeInsideUp,
  ),
  def(
    'three-inside-down',
    'Three Inside Down',
    'triple',
    'bearish',
    3,
    'Bearish harami confirmed by a third down bar.',
    threeInsideDown,
  ),
];

const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));

export const allPatterns = (): readonly PatternCatalogEntry[] =>
  PATTERNS.map(({ id, name, kind, direction, bars, description }) => ({
    id,
    name,
    kind,
    direction,
    bars,
    description,
  }));

export const findPattern = (id: string): PatternDefinition | undefined => BY_ID.get(id);

export interface DetectOptions {
  /** Restrict detection to these pattern ids. Unknown ids are ignored. */
  readonly ids?: readonly string[];
}

/**
 * Scan `bars` and return every pattern match, in bar order. Multiple patterns
 * can complete on the same bar; each is returned separately.
 */
export const detectAll = (bars: ReadonlyArray<Bar>, opts: DetectOptions = {}): PatternMatch[] => {
  const idSet = opts.ids ? new Set(opts.ids) : undefined;
  const defs = idSet ? PATTERNS.filter((p) => idSet.has(p.id)) : PATTERNS;
  const out: PatternMatch[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!b) continue;
    for (const p of defs) {
      if (p.detect(bars, i)) {
        out.push({
          id: p.id,
          name: p.name,
          kind: p.kind,
          direction: p.direction,
          index: i,
          startIndex: i - (p.bars - 1),
          time: b.time,
        });
      }
    }
  }
  return out;
};
