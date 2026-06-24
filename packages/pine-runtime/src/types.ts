import type { Series } from './series.js';

/** A runtime value: a scalar, a color, a bar-aligned series, or `na`. */
export type PineValue =
  | { kind: 'num'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'str'; value: string }
  | { kind: 'color'; value: string }
  | { kind: 'series'; data: Series }
  | { kind: 'na' };

export type InputType = 'int' | 'float' | 'bool' | 'string' | 'source';

export interface InputDef {
  name: string;
  type: InputType;
  default: number | boolean | string;
  value: number | boolean | string;
  min?: number;
  max?: number;
}

export interface PlotOut {
  title: string;
  color: string;
  type: 'line' | 'hline';
  data: Series;
}

export interface PineRunResult {
  title: string;
  overlay: boolean;
  kind: 'indicator' | 'strategy';
  inputs: InputDef[];
  plots: PlotOut[];
  /** Bar times (epoch seconds) aligned to every plot's `data`. */
  times: number[];
}

export class PineRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PineRuntimeError';
  }
}

export const NA: PineValue = { kind: 'na' };
export const num = (value: number): PineValue => ({ kind: 'num', value });
export const bool = (value: boolean): PineValue => ({ kind: 'bool', value });
export const str = (value: string): PineValue => ({ kind: 'str', value });
export const color = (value: string): PineValue => ({ kind: 'color', value });
export const series = (data: Series): PineValue => ({ kind: 'series', data });

export const isSeries = (v: PineValue): v is { kind: 'series'; data: Series } => v.kind === 'series';
