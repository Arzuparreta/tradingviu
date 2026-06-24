import type { Bar } from '@tv/data-types';
import type { Expr, Arg, Program } from '@tv/pine-parser';
import * as ta from './series.js';
import type { Series } from './series.js';
import {
  type PineValue,
  type InputDef,
  type PlotOut,
  type PineRunResult,
  PineRuntimeError,
  NA,
  num,
  bool,
  str,
  color,
  series,
  isSeries,
} from './types.js';

type Cell = number | null;

const COLORS: Record<string, string> = {
  red: '#f23645', green: '#089981', blue: '#2962ff', orange: '#ff9800',
  purple: '#9c27b0', yellow: '#ffeb3b', white: '#ffffff', black: '#000000',
  gray: '#787b86', teal: '#00897b', lime: '#c0ca33', maroon: '#880e4f',
  navy: '#311b92', fuchsia: '#e040fb', aqua: '#00bcd4', silver: '#b2b5be',
};
const DEFAULT_PLOT_COLOR = COLORS.blue!;

interface Ctx {
  len: number;
  base: Record<string, Cell[]>;
  raw: { high: number[]; low: number[]; close: number[] };
  scope: Map<string, PineValue>;
  inputs: InputDef[];
  overrides: Record<string, number | boolean | string>;
  plots: PlotOut[];
  meta: { title: string; overlay: boolean; kind: 'indicator' | 'strategy' };
  inputCounter: number;
  plotCounter: number;
}

// --- coercions -------------------------------------------------------------

const asCells = (v: PineValue, len: number): Cell[] => {
  switch (v.kind) {
    case 'series': return v.data;
    case 'num': return new Array(len).fill(v.value);
    case 'bool': return new Array(len).fill(v.value ? 1 : 0);
    case 'na': return new Array(len).fill(null);
    default: throw new PineRuntimeError(`expected a number/series, got ${v.kind}`);
  }
};

const asNumber = (v: PineValue, what = 'argument'): number => {
  if (v.kind === 'num') return v.value;
  if (v.kind === 'bool') return v.value ? 1 : 0;
  throw new PineRuntimeError(`${what} must be a number, got ${v.kind}`);
};

const asString = (v: PineValue, what = 'argument'): string => {
  if (v.kind === 'str') return v.value;
  throw new PineRuntimeError(`${what} must be a string, got ${v.kind}`);
};

// --- operators -------------------------------------------------------------

const cellArith = (op: string, a: Cell, b: Cell): Cell => {
  if (a === null || b === null) return null;
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? null : a / b;
    case '%': return b === 0 ? null : a % b;
    default: throw new PineRuntimeError(`unknown operator ${op}`);
  }
};

const cellCompare = (op: string, a: Cell, b: Cell): Cell => {
  if (a === null || b === null) return null;
  switch (op) {
    case '==': return a === b ? 1 : 0;
    case '!=': return a !== b ? 1 : 0;
    case '<': return a < b ? 1 : 0;
    case '<=': return a <= b ? 1 : 0;
    case '>': return a > b ? 1 : 0;
    case '>=': return a >= b ? 1 : 0;
    default: throw new PineRuntimeError(`unknown operator ${op}`);
  }
};

const cellLogic = (op: string, a: Cell, b: Cell): Cell => {
  if (a === null || b === null) return null;
  const ab = a !== 0;
  const bb = b !== 0;
  return (op === 'and' ? ab && bb : ab || bb) ? 1 : 0;
};

const ARITH = new Set(['+', '-', '*', '/', '%']);
const COMPARE = new Set(['==', '!=', '<', '<=', '>', '>=']);

const evalBinary = (op: string, l: PineValue, r: PineValue, len: number): PineValue => {
  // String concatenation and scalar string comparison.
  if (l.kind === 'str' || r.kind === 'str') {
    if (op === '+' && l.kind === 'str' && r.kind === 'str') return str(l.value + r.value);
    if (op === '==' && l.kind === 'str' && r.kind === 'str') return bool(l.value === r.value);
    if (op === '!=' && l.kind === 'str' && r.kind === 'str') return bool(l.value !== r.value);
    throw new PineRuntimeError(`operator ${op} not supported on strings`);
  }
  const scalar = !isSeries(l) && !isSeries(r);
  const cellFn = ARITH.has(op) ? cellArith : COMPARE.has(op) ? cellCompare : cellLogic;

  if (scalar) {
    if (l.kind === 'na' || r.kind === 'na') return NA;
    const a = l.kind === 'bool' ? (l.value ? 1 : 0) : (l as { value: number }).value;
    const b = r.kind === 'bool' ? (r.value ? 1 : 0) : (r as { value: number }).value;
    const out = cellFn(op, a, b);
    if (out === null) return NA;
    return COMPARE.has(op) || !ARITH.has(op) ? bool(out !== 0) : num(out);
  }

  const la = asCells(l, len);
  const ra = asCells(r, len);
  const data: Series = new Array(len);
  for (let i = 0; i < len; i++) data[i] = cellFn(op, la[i] ?? null, ra[i] ?? null);
  return series(data);
};

// --- builtins --------------------------------------------------------------

type Builtin = (pos: PineValue[], named: Record<string, PineValue>, ctx: Ctx) => PineValue;

const arg = (pos: PineValue[], named: Record<string, PineValue>, i: number, name: string): PineValue | undefined =>
  pos[i] ?? named[name];

const seriesArg = (pos: PineValue[], named: Record<string, PineValue>, i: number, name: string, ctx: Ctx): Series => {
  const v = arg(pos, named, i, name);
  if (!v) throw new PineRuntimeError(`missing argument "${name}"`);
  return asCells(v, ctx.len);
};

const registerInput = (
  ctx: Ctx,
  type: InputDef['type'],
  defval: number | boolean | string,
  named: Record<string, PineValue>,
): number | boolean | string => {
  const title = named['title'] && named['title'].kind === 'str' ? named['title'].value : `input_${++ctx.inputCounter}`;
  const override = ctx.overrides[title];
  let value: number | boolean | string = override !== undefined ? override : defval;
  if (type === 'int') value = Math.round(Number(value));
  else if (type === 'float') value = Number(value);
  else if (type === 'bool') value = Boolean(value);
  else value = String(value);
  const def: InputDef = { name: title, type, default: defval, value };
  if (named['minval'] && named['minval'].kind === 'num') def.min = named['minval'].value;
  if (named['maxval'] && named['maxval'].kind === 'num') def.max = named['maxval'].value;
  ctx.inputs.push(def);
  return value;
};

const elementwise1 = (v: PineValue, len: number, fn: (x: number) => number): PineValue => {
  if (v.kind === 'num') return num(fn(v.value));
  if (v.kind === 'na') return NA;
  const cells = asCells(v, len);
  return series(cells.map((c) => (c === null ? null : fn(c))));
};

const BUILTINS: Record<string, Builtin> = {
  indicator: (pos, named, ctx) => {
    const title = pos[0] ?? named['title'];
    if (title && title.kind === 'str') ctx.meta.title = title.value;
    const ov = named['overlay'];
    if (ov && ov.kind === 'bool') ctx.meta.overlay = ov.value;
    ctx.meta.kind = 'indicator';
    return NA;
  },
  strategy: (pos, named, ctx) => {
    const title = pos[0] ?? named['title'];
    if (title && title.kind === 'str') ctx.meta.title = title.value;
    const ov = named['overlay'];
    if (ov && ov.kind === 'bool') ctx.meta.overlay = ov.value;
    ctx.meta.kind = 'strategy';
    return NA;
  },

  'input.int': (pos, named, ctx) => num(registerInput(ctx, 'int', asNumber(pos[0] ?? num(0), 'defval'), named) as number),
  'input.float': (pos, named, ctx) => num(registerInput(ctx, 'float', asNumber(pos[0] ?? num(0), 'defval'), named) as number),
  'input.bool': (pos, named, ctx) => bool(registerInput(ctx, 'bool', pos[0]?.kind === 'bool' ? pos[0].value : false, named) as boolean),
  'input.string': (pos, named, ctx) => str(registerInput(ctx, 'string', pos[0]?.kind === 'str' ? pos[0].value : '', named) as string),
  'input.source': (pos) => pos[0] ?? NA,
  input: (pos, named, ctx) => {
    const d = pos[0] ?? num(0);
    if (d.kind === 'bool') return bool(registerInput(ctx, 'bool', d.value, named) as boolean);
    if (d.kind === 'str') return str(registerInput(ctx, 'string', d.value, named) as string);
    return num(registerInput(ctx, 'float', asNumber(d, 'defval'), named) as number);
  },

  'ta.sma': (pos, named, ctx) => series(ta.sma(seriesArg(pos, named, 0, 'source', ctx), asNumber(arg(pos, named, 1, 'length') ?? num(14), 'length'))),
  'ta.ema': (pos, named, ctx) => series(ta.ema(seriesArg(pos, named, 0, 'source', ctx), asNumber(arg(pos, named, 1, 'length') ?? num(14), 'length'))),
  'ta.wma': (pos, named, ctx) => series(ta.wma(seriesArg(pos, named, 0, 'source', ctx), asNumber(arg(pos, named, 1, 'length') ?? num(14), 'length'))),
  'ta.rma': (pos, named, ctx) => series(ta.rma(seriesArg(pos, named, 0, 'source', ctx), asNumber(arg(pos, named, 1, 'length') ?? num(14), 'length'))),
  'ta.rsi': (pos, named, ctx) => series(ta.rsi(seriesArg(pos, named, 0, 'source', ctx), asNumber(arg(pos, named, 1, 'length') ?? num(14), 'length'))),
  'ta.stdev': (pos, named, ctx) => series(ta.stdev(seriesArg(pos, named, 0, 'source', ctx), asNumber(arg(pos, named, 1, 'length') ?? num(14), 'length'))),
  'ta.change': (pos, named, ctx) => series(ta.change(seriesArg(pos, named, 0, 'source', ctx))),
  'ta.highest': (pos, named, ctx) => series(ta.highest(seriesArg(pos, named, 0, 'source', ctx), asNumber(arg(pos, named, 1, 'length') ?? num(14), 'length'))),
  'ta.lowest': (pos, named, ctx) => series(ta.lowest(seriesArg(pos, named, 0, 'source', ctx), asNumber(arg(pos, named, 1, 'length') ?? num(14), 'length'))),
  'ta.atr': (pos, named, ctx) => series(ta.atr(ctx.raw.high, ctx.raw.low, ctx.raw.close, asNumber(pos[0] ?? num(14), 'length'))),

  'math.abs': (pos, _n, ctx) => elementwise1(pos[0] ?? NA, ctx.len, Math.abs),
  'math.sqrt': (pos, _n, ctx) => elementwise1(pos[0] ?? NA, ctx.len, Math.sqrt),
  'math.round': (pos, _n, ctx) => elementwise1(pos[0] ?? NA, ctx.len, Math.round),
  'math.floor': (pos, _n, ctx) => elementwise1(pos[0] ?? NA, ctx.len, Math.floor),
  'math.ceil': (pos, _n, ctx) => elementwise1(pos[0] ?? NA, ctx.len, Math.ceil),
  'math.log': (pos, _n, ctx) => elementwise1(pos[0] ?? NA, ctx.len, Math.log),
  'math.pow': (pos, _n, ctx) => {
    const base = pos[0] ?? NA;
    const exp = asNumber(pos[1] ?? num(2), 'exponent');
    return elementwise1(base, ctx.len, (x) => x ** exp);
  },
  'math.max': (pos) => num(Math.max(...pos.map((p) => asNumber(p, 'math.max')))),
  'math.min': (pos) => num(Math.min(...pos.map((p) => asNumber(p, 'math.min')))),

  nz: (pos, _n, ctx) => {
    const v = pos[0] ?? NA;
    const repl = pos[1] ? asNumber(pos[1], 'replacement') : 0;
    if (v.kind === 'na') return num(repl);
    if (v.kind === 'series') return series(v.data.map((c) => (c === null ? repl : c)));
    return v;
  },
  na: (pos, _n, ctx) => {
    const v = pos[0] ?? NA;
    if (v.kind === 'series') return series(v.data.map((c) => (c === null ? 1 : 0)));
    return bool(v.kind === 'na');
  },

  plot: (pos, named, ctx) => {
    const data = seriesArg(pos, named, 0, 'series', ctx);
    const title = named['title']?.kind === 'str' ? named['title'].value : `plot ${++ctx.plotCounter}`;
    const col = named['color']?.kind === 'color' ? named['color'].value : DEFAULT_PLOT_COLOR;
    ctx.plots.push({ title, color: col, type: 'line', data });
    return NA;
  },
  hline: (pos, named, ctx) => {
    const price = asNumber(pos[0] ?? num(0), 'price');
    const title = named['title']?.kind === 'str' ? named['title'].value : `hline ${++ctx.plotCounter}`;
    const col = named['color']?.kind === 'color' ? named['color'].value : COLORS.gray!;
    ctx.plots.push({ title, color: col, type: 'hline', data: new Array(ctx.len).fill(price) });
    return NA;
  },
  // plotshape/plotchar/bgcolor are accepted but not rendered in v1.
  plotshape: () => NA,
  plotchar: () => NA,
  bgcolor: () => NA,
};

// --- evaluator -------------------------------------------------------------

const callKey = (callee: Expr): string => {
  if (callee.type === 'Ident') return callee.name;
  if (callee.type === 'Member' && callee.object.type === 'Ident') return `${callee.object.name}.${callee.property}`;
  throw new PineRuntimeError('unsupported call target');
};

const evaluate = (expr: Expr, ctx: Ctx): PineValue => {
  switch (expr.type) {
    case 'Num': return num(expr.value);
    case 'Str': return str(expr.value);
    case 'Bool': return bool(expr.value);
    case 'Ident': {
      if (expr.name === 'na') return NA;
      const base = ctx.base[expr.name];
      if (base) return series(base);
      const v = ctx.scope.get(expr.name);
      if (v) return v;
      throw new PineRuntimeError(`undefined variable: ${expr.name}`);
    }
    case 'Member': {
      if (expr.object.type === 'Ident') {
        if (expr.object.name === 'color') {
          const c = COLORS[expr.property];
          if (c) return color(c);
        }
        if (expr.object.name === 'math') {
          if (expr.property === 'pi') return num(Math.PI);
          if (expr.property === 'e') return num(Math.E);
        }
      }
      throw new PineRuntimeError(`unknown member ${expr.object.type === 'Ident' ? expr.object.name + '.' : ''}${expr.property}`);
    }
    case 'Unary': {
      const v = evaluate(expr.operand, ctx);
      if (expr.op === '-') return elementwise1(v, ctx.len, (x) => -x);
      // not
      if (v.kind === 'bool') return bool(!v.value);
      if (v.kind === 'na') return NA;
      if (v.kind === 'series') return series(v.data.map((c) => (c === null ? null : c === 0 ? 1 : 0)));
      throw new PineRuntimeError('operator not requires a boolean/series');
    }
    case 'Binary': return evalBinary(expr.op, evaluate(expr.left, ctx), evaluate(expr.right, ctx), ctx.len);
    case 'Ternary': {
      const cond = evaluate(expr.cond, ctx);
      if (cond.kind === 'bool') return cond.value ? evaluate(expr.consequent, ctx) : evaluate(expr.alternate, ctx);
      if (cond.kind === 'na') return NA;
      // series condition → per-bar select
      const c = asCells(cond, ctx.len);
      const a = asCells(evaluate(expr.consequent, ctx), ctx.len);
      const b = asCells(evaluate(expr.alternate, ctx), ctx.len);
      const out: Series = new Array(ctx.len);
      for (let i = 0; i < ctx.len; i++) {
        const ci = c[i] ?? null;
        out[i] = ci === null ? null : ci !== 0 ? (a[i] ?? null) : (b[i] ?? null);
      }
      return series(out);
    }
    case 'Call': {
      const key = callKey(expr.callee);
      const fn = BUILTINS[key];
      if (!fn) throw new PineRuntimeError(`unknown function: ${key}`);
      const pos: PineValue[] = [];
      const named: Record<string, PineValue> = {};
      for (const a of expr.args as Arg[]) {
        if (a.name === null) pos.push(evaluate(a.value, ctx));
        else named[a.name] = evaluate(a.value, ctx);
      }
      return fn(pos, named, ctx);
    }
  }
};

export const run = (
  program: Program,
  bars: ReadonlyArray<Bar>,
  overrides: Record<string, number | boolean | string> = {},
): PineRunResult => {
  const len = bars.length;
  const close = bars.map((b) => b.close);
  const open = bars.map((b) => b.open);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume);
  const ctx: Ctx = {
    len,
    base: {
      close, open, high, low, volume,
      hl2: bars.map((b) => (b.high + b.low) / 2),
      hlc3: bars.map((b) => (b.high + b.low + b.close) / 3),
      ohlc4: bars.map((b) => (b.open + b.high + b.low + b.close) / 4),
    },
    raw: { high, low, close },
    scope: new Map(),
    inputs: [],
    overrides,
    plots: [],
    meta: { title: 'Untitled', overlay: false, kind: 'indicator' },
    inputCounter: 0,
    plotCounter: 0,
  };

  for (const stmt of program.statements) {
    if (stmt.type === 'VarDecl') ctx.scope.set(stmt.name, evaluate(stmt.value, ctx));
    else evaluate(stmt.expr, ctx);
  }

  return {
    title: ctx.meta.title,
    overlay: ctx.meta.overlay,
    kind: ctx.meta.kind,
    inputs: ctx.inputs,
    plots: ctx.plots,
    times: bars.map((b) => b.time),
  };
};
