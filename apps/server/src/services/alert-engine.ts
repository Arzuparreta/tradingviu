import type {
  AlertCondition,
  AlertOperator,
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

export const evaluateAlertCondition = (
  condition: AlertCondition,
  ctx: AlertEvaluationContext,
): AlertEvaluationResult => {
  switch (condition.type) {
    case 'price':
      return evaluatePrice(condition, ctx);
    case 'indicator':
      return evaluateIndicator(condition, ctx);
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
