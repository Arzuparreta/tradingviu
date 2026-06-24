import { describe, it, expect } from 'bun:test';
import { parse, extractVersion, PineParseError, type Expr } from './index.js';

describe('extractVersion', () => {
  it('reads the //@version directive', () => {
    expect(extractVersion('//@version=5\nindicator("x")')).toBe(5);
    expect(extractVersion('indicator("x")')).toBeNull();
  });
});

describe('parse', () => {
  it('parses an indicator declaration with named args', () => {
    const p = parse('//@version=5\nindicator("My SMA", overlay=true)');
    expect(p.version).toBe(5);
    expect(p.statements).toHaveLength(1);
    const st = p.statements[0]!;
    expect(st.type).toBe('ExprStatement');
    if (st.type !== 'ExprStatement' || st.expr.type !== 'Call') throw new Error('expected call');
    expect(st.expr.callee).toEqual({ type: 'Ident', name: 'indicator' });
    expect(st.expr.args[0]).toEqual({ name: null, value: { type: 'Str', value: 'My SMA' } });
    expect(st.expr.args[1]).toEqual({ name: 'overlay', value: { type: 'Bool', value: true } });
  });

  it('parses a var decl and a member call (ta.sma)', () => {
    const p = parse('length = 14\nout = ta.sma(close, length)');
    expect(p.statements).toHaveLength(2);
    const decl = p.statements[1]!;
    if (decl.type !== 'VarDecl') throw new Error('expected VarDecl');
    expect(decl.name).toBe('out');
    if (decl.value.type !== 'Call') throw new Error('expected Call');
    expect(decl.value.callee).toEqual({ type: 'Member', object: { type: 'Ident', name: 'ta' }, property: 'sma' });
    expect(decl.value.args.map((a) => a.value.type)).toEqual(['Ident', 'Ident']);
  });

  it('respects arithmetic precedence (* before +)', () => {
    const p = parse('x = 1 + 2 * 3');
    const decl = p.statements[0]!;
    if (decl.type !== 'VarDecl' || decl.value.type !== 'Binary') throw new Error('expected binary');
    expect(decl.value.op).toBe('+');
    const right = decl.value.right as Expr;
    if (right.type !== 'Binary') throw new Error('expected nested binary');
    expect(right.op).toBe('*');
  });

  it('parses comparison, and/or, and the ternary', () => {
    const p = parse('signal = close > open and rsi < 30 ? 1 : 0');
    const decl = p.statements[0]!;
    if (decl.type !== 'VarDecl' || decl.value.type !== 'Ternary') throw new Error('expected ternary');
    expect(decl.value.cond.type).toBe('Binary'); // the `and`
  });

  it('ignores blank lines and comments between statements', () => {
    const p = parse('//@version=5\n\n// header\na = 1\n\nplot(a) // trailing\n');
    expect(p.statements).toHaveLength(2);
  });

  it('does not treat keywords as identifiers', () => {
    const p = parse('x = a and b');
    const decl = p.statements[0]!;
    if (decl.type !== 'VarDecl' || decl.value.type !== 'Binary') throw new Error('expected binary');
    expect(decl.value.op).toBe('and');
  });

  it('throws PineParseError on a syntax error', () => {
    expect(() => parse('x = (1 + ')).toThrow(PineParseError);
  });
});
