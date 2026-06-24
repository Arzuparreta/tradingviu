import type { Bar } from '@tv/data-types';
import { parse, PineParseError, type Program } from '@tv/pine-parser';
import { run } from './interpreter.js';
import { PineRuntimeError, type PineRunResult } from './types.js';

export * from './types.js';
export { run } from './interpreter.js';
export * as seriesMath from './series.js';

export interface ValidateResult {
  ok: boolean;
  error?: { kind: 'parse' | 'runtime'; message: string; line?: number; column?: number };
  meta?: { title: string; overlay: boolean; kind: 'indicator' | 'strategy' };
}

/**
 * Compile + dry-run a script against a single synthetic bar to surface parse and
 * obvious runtime errors (unknown functions/variables) without needing market data.
 */
export const validate = (source: string): ValidateResult => {
  let program: Program;
  try {
    program = parse(source);
  } catch (e) {
    if (e instanceof PineParseError) {
      const err: ValidateResult['error'] = { kind: 'parse', message: e.message };
      if (e.location) { err.line = e.location.line; err.column = e.location.column; }
      return { ok: false, error: err };
    }
    throw e;
  }
  const probe: Bar = { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 };
  try {
    const result = run(program, [probe]);
    return { ok: true, meta: { title: result.title, overlay: result.overlay, kind: result.kind } };
  } catch (e) {
    if (e instanceof PineRuntimeError) return { ok: false, error: { kind: 'runtime', message: e.message } };
    throw e;
  }
};

/** Parse + run a script over bars, returning plots/inputs/metadata. */
export const compileAndRun = (
  source: string,
  bars: ReadonlyArray<Bar>,
  overrides: Record<string, number | boolean | string> = {},
): PineRunResult => run(parse(source), bars, overrides);
