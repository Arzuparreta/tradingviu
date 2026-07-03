import { registerOverlay } from 'klinecharts';
import { arrowLine, crossLine } from './lines';
import { flatTopBottom, parallelChannel, pitchfork, regressionTrend } from './channels';
import { fibExtension, fibRetracement } from './fib';
import { ellipse, rect, triangle } from './shapes';
import { callout, priceLabel, text } from './annotations';
import { dateRange, longPosition, priceRange, shortPosition } from './measure';

let registered = false;

/** Register all custom overlays exactly once (idempotent per module load). */
export function registerChartOverlays(): void {
  if (registered) return;
  registered = true;
  for (const template of [
    crossLine,
    arrowLine,
    parallelChannel,
    flatTopBottom,
    regressionTrend,
    pitchfork,
    fibRetracement,
    fibExtension,
    rect,
    ellipse,
    triangle,
    text,
    callout,
    priceLabel,
    priceRange,
    dateRange,
    longPosition,
    shortPosition,
  ]) {
    registerOverlay(template);
  }
}

/** Overlays that carry editable text in extendData.text. */
export const TEXT_OVERLAYS = new Set(['text', 'callout']);

/** Overlays whose colors are semantic — hide the color picker for them. */
export const SEMANTIC_COLOR_OVERLAYS = new Set([
  'priceRange',
  'dateRange',
  'longPosition',
  'shortPosition',
  'fibRetracement',
  'fibExtension',
]);

/** Overlays with an area fill the style editor may tint. */
export const FILLED_OVERLAYS = new Set([
  'rect',
  'ellipse',
  'triangle',
  'parallelChannel',
  'flatTopBottom',
  'regressionTrend',
]);
