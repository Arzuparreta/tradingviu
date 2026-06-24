/** AST for the supported Pine Script v5 subset. */

export type BinOp =
  | '+' | '-' | '*' | '/' | '%'
  | '==' | '!=' | '<' | '<=' | '>' | '>='
  | 'and' | 'or';

export type Expr =
  | { type: 'Num'; value: number }
  | { type: 'Str'; value: string }
  | { type: 'Bool'; value: boolean }
  | { type: 'Ident'; name: string }
  | { type: 'Member'; object: Expr; property: string }
  | { type: 'Call'; callee: Expr; args: Arg[] }
  | { type: 'Unary'; op: '-' | 'not'; operand: Expr }
  | { type: 'Binary'; op: BinOp; left: Expr; right: Expr }
  | { type: 'Ternary'; cond: Expr; consequent: Expr; alternate: Expr };

/** A call argument: positional (`name === null`) or named (`title=...`). */
export interface Arg {
  name: string | null;
  value: Expr;
}

export type Statement =
  | { type: 'VarDecl'; name: string; value: Expr }
  | { type: 'ExprStatement'; expr: Expr };

export interface Program {
  /** The `//@version=N` directive value, or null if absent. */
  version: number | null;
  statements: Statement[];
}

export interface SourceLocation {
  line: number;
  column: number;
}

export class PineParseError extends Error {
  constructor(
    message: string,
    public readonly location?: SourceLocation,
  ) {
    super(message);
    this.name = 'PineParseError';
  }
}
