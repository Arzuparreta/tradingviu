import type {
  AlertCondition,
  AlertOperator,
  DrawingAlertCondition,
  IndicatorAlertCondition,
  PriceAlertCondition,
} from '@tv/core';
import type { Bar } from '@tv/data-types';
import { compute, find } from '@tv/ta-lib';
import { ValidationError } from '@tv/core';

export interface AlertEvaluationContext {
  readonly price: number;
  readonly previousPrice?: number;
  readonly bars?: ReadonlyArray<Bar>;
}

export interface AlertEvaluationResult {
  readonly fired: boolean;
  readonly value: number;
  readonly reason: string;
}

const compare = (
  operator: AlertOperator,
  value: number,
  threshold: number,
  previousValue?: number,
): boolean => {
  switch (operator) {
    case 'above':
      return value > threshold;
    case 'below':
      return value < threshold;
    case 'equals':
      return value === threshold;
    case 'crosses_above':
      return previousValue !== undefined && previousValue <= threshold && value > threshold;
    case 'crosses_below':
      return previousValue !== undefined && previousValue >= threshold && value < threshold;
  }
};

const latestPointValue = (condition: IndicatorAlertCondition, bars: ReadonlyArray<Bar>): number => {
  const indicator = find(condition.indicatorId);
  if (!indicator) throw new ValidationError('Unknown indicator', { indicatorId: condition.indicatorId });
  const output = compute(condition.indicatorId, bars, condition.params);
  if (condition.line === 'histogram') {
    const last = output.histogram?.at(-1);
    if (!last) throw new ValidationError('Indicator histogram produced no values');
    return last.value;
  }
  if (condition.line === 'upper' || condition.line === 'middle' || condition.line === 'lower') {
    const last = output.bands?.at(-1);
    if (!last) throw new ValidationError('Indicator band produced no values');
    return last[condition.line];
  }
  const last = output.points.at(-1);
  if (!last) throw new ValidationError('Indicator produced no values');
  return last.value;
};

const evaluatePrice = (
  condition: PriceAlertCondition,
  ctx: AlertEvaluationContext,
): AlertEvaluationResult => {
  const fired = compare(condition.operator, ctx.price, condition.value, ctx.previousPrice);
  return {
    fired,
    value: ctx.price,
    reason: `price ${condition.operator} ${condition.value}`,
  };
};

const evaluateIndicator = (
  condition: IndicatorAlertCondition,
  ctx: AlertEvaluationContext,
): AlertEvaluationResult => {
  if (!ctx.bars || ctx.bars.length === 0) {
    throw new ValidationError('Indicator alerts require historical bars');
  }
  const value = latestPointValue(condition, ctx.bars);
  const previous = ctx.bars.length > 1 ? latestPointValue(condition, ctx.bars.slice(0, -1)) : undefined;
  const fired = compare(condition.operator, value, condition.value, previous);
  return {
    fired,
    value,
    reason: `${condition.indicatorId}.${condition.line} ${condition.operator} ${condition.value}`,
  };
};

const priceOnLine = (
  p0: { readonly timestamp?: number | undefined; readonly value?: number | undefined },
  p1: { readonly timestamp?: number | undefined; readonly value?: number | undefined },
  timeMs: number,
): number | null => {
  if (typeof p0.value !== 'number' || typeof p1.value !== 'number') return null;
  if (typeof p0.timestamp !== 'number' || typeof p1.timestamp !== 'number' || p0.timestamp === p1.timestamp) {
    return p1.value;
  }
  const ratio = (timeMs - p0.timestamp) / (p1.timestamp - p0.timestamp);
  return p0.value + (p1.value - p0.value) * ratio;
};

const drawingLevelAt = (condition: DrawingAlertCondition, timeMs: number): number => {
  const drawing = condition.drawing;
  const points = drawing.points;
  if (points.length === 0) throw new ValidationError('Drawing alert requires drawing points');

  if (
    drawing.name === 'horizontalStraightLine' ||
    drawing.name === 'horizontalRayLine' ||
    drawing.name === 'priceLine' ||
    points.length === 1
  ) {
    const value = points[0]?.value;
    if (typeof value !== 'number') throw new ValidationError('Drawing alert requires price geometry');
    return value;
  }

  if (drawing.name === 'rect' || drawing.name === 'priceRange' || drawing.name === 'datePriceRange') {
    const values = points.map((point) => point.value).filter((value): value is number => typeof value === 'number');
    if (values.length === 0) throw new ValidationError('Drawing alert requires price geometry');
    if (condition.target === 'lower') return Math.min(...values);
    if (condition.target === 'upper') return Math.max(...values);
    return (Math.min(...values) + Math.max(...values)) / 2;
  }

  if ((drawing.name === 'priceChannelLine' || drawing.name === 'parallelStraightLine' || drawing.name === 'fibChannel') && points.length >= 4) {
    const line =
      condition.target === 'upper' || condition.target === 'lower'
        ? [points[2]!, points[3]!] as const
        : [points[0]!, points[1]!] as const;
    const value = priceOnLine(line[0], line[1], timeMs);
    if (value === null || !Number.isFinite(value)) throw new ValidationError('Drawing alert requires price geometry');
    return value;
  }

  if (points.length >= 2) {
    const value = priceOnLine(points[0]!, points[1]!, timeMs);
    if (value === null || !Number.isFinite(value)) throw new ValidationError('Drawing alert requires price geometry');
    return value;
  }

  throw new ValidationError('Unsupported drawing alert geometry', { drawing: drawing.name });
};

const compareDynamic = (
  operator: AlertOperator,
  value: number,
  threshold: number,
  previousValue?: number,
  previousThreshold?: number,
): boolean => {
  switch (operator) {
    case 'crosses_above':
      return previousValue !== undefined && previousThreshold !== undefined && previousValue <= previousThreshold && value > threshold;
    case 'crosses_below':
      return previousValue !== undefined && previousThreshold !== undefined && previousValue >= previousThreshold && value < threshold;
    default:
      return compare(operator, value, threshold, previousValue);
  }
};

const evaluateDrawing = (
  condition: DrawingAlertCondition,
  ctx: AlertEvaluationContext,
): AlertEvaluationResult => {
  const lastBar = ctx.bars?.at(-1);
  const previousBar = ctx.bars && ctx.bars.length > 1 ? ctx.bars.at(-2) : undefined;
  const timeMs = lastBar ? lastBar.time * 1000 : Date.now();
  const previousTimeMs = previousBar ? previousBar.time * 1000 : timeMs;
  const level = drawingLevelAt(condition, timeMs);
  const previousLevel = previousBar ? drawingLevelAt(condition, previousTimeMs) : undefined;
  const fired = compareDynamic(condition.operator, ctx.price, level, ctx.previousPrice, previousLevel);
  return {
    fired,
    value: level,
    reason: `${condition.drawing.name} ${condition.target} ${condition.operator} ${level}`,
  };
};

export const evaluateAlertCondition = (
  condition: AlertCondition,
  ctx: AlertEvaluationContext,
): AlertEvaluationResult => {
  switch (condition.type) {
    case 'price':
      return evaluatePrice(condition, ctx);
    case 'indicator':
      return evaluateIndicator(condition, ctx);
    case 'drawing':
      return evaluateDrawing(condition, ctx);
    case 'multi': {
      const results = condition.conditions.map((child) => evaluateAlertCondition(child, ctx));
      const fired = condition.match === 'all' ? results.every((r) => r.fired) : results.some((r) => r.fired);
      return {
        fired,
        value: ctx.price,
        reason: `${condition.match}(${results.map((r) => r.reason).join(', ')})`,
      };
    }
  }
};
