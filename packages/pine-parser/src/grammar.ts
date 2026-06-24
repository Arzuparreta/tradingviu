/**
 * PEG grammar (peggy) for the supported Pine Script v5 subset.
 *
 * Supported: `//@version` directive + line comments, `name = expr` declarations,
 * expression statements (e.g. plot/plotshape calls), member access (`ta.sma`,
 * `color.red`), function calls with positional + named args, arithmetic,
 * comparison, `and`/`or`/`not`, the `?:` ternary, numbers, strings, booleans.
 *
 * Not supported (v1): multi-line statements / line continuation, `:=` reassignment,
 * `var`/`varip`, `if`/`for`/`while`, user function defs (`f(x) =>`), arrays/maps.
 */
export const GRAMMAR = String.raw`
{
  function fold(head, tail) {
    return tail.reduce((left, t) => ({ type: 'Binary', op: t[0], left, right: t[1] }), head);
  }
}

Program
  = __ stmts:StatementList? __ { return { version: null, statements: stmts || [] }; }

StatementList
  = first:Statement rest:(StatementSep s:Statement { return s; })* StatementSep? { return [first, ...rest]; }

StatementSep
  = _ NL __

Statement
  = VarDecl
  / ExprStatement

VarDecl
  = name:RawIdent _ "=" !"=" _ value:Expr { return { type: 'VarDecl', name, value }; }

ExprStatement
  = e:Expr { return { type: 'ExprStatement', expr: e }; }

Expr = Ternary

Ternary
  = cond:OrExpr _ "?" _ c:Ternary _ ":" _ a:Ternary { return { type: 'Ternary', cond, consequent: c, alternate: a }; }
  / OrExpr

OrExpr
  = head:AndExpr tail:(_ "or" !IdentChar _ right:AndExpr { return ['or', right]; })* { return fold(head, tail); }

AndExpr
  = head:EqExpr tail:(_ "and" !IdentChar _ right:EqExpr { return ['and', right]; })* { return fold(head, tail); }

EqExpr
  = head:RelExpr tail:(_ op:("==" / "!=") _ right:RelExpr { return [op, right]; })* { return fold(head, tail); }

RelExpr
  = head:AddExpr tail:(_ op:("<=" / ">=" / "<" / ">") _ right:AddExpr { return [op, right]; })* { return fold(head, tail); }

AddExpr
  = head:MulExpr tail:(_ op:("+" / "-") _ right:MulExpr { return [op, right]; })* { return fold(head, tail); }

MulExpr
  = head:Unary tail:(_ op:("*" / "/" / "%") _ right:Unary { return [op, right]; })* { return fold(head, tail); }

Unary
  = "-" _ e:Unary { return { type: 'Unary', op: '-', operand: e }; }
  / "not" !IdentChar _ e:Unary { return { type: 'Unary', op: 'not', operand: e }; }
  / Postfix

Postfix
  = base:Primary ops:PostfixOp* {
      return ops.reduce((obj, op) => {
        if (op.kind === 'member') return { type: 'Member', object: obj, property: op.property };
        return { type: 'Call', callee: obj, args: op.args };
      }, base);
    }

PostfixOp
  = "." p:RawIdent { return { kind: 'member', property: p }; }
  / "(" _ args:ArgList? _ ")" { return { kind: 'call', args: args || [] }; }

ArgList
  = first:Arg rest:(_ "," _ a:Arg { return a; })* { return [first, ...rest]; }

Arg
  = name:RawIdent _ "=" !"=" _ v:Expr { return { name, value: v }; }
  / v:Expr { return { name: null, value: v }; }

Primary
  = Number
  / String
  / Bool
  / ParenExpr
  / Identifier

ParenExpr = "(" _ e:Expr _ ")" { return e; }

Number
  = digits:$([0-9]+ ("." [0-9]+)?) { return { type: 'Num', value: parseFloat(digits) }; }

String
  = "\"" chars:$[^"]* "\"" { return { type: 'Str', value: chars }; }
  / "'" chars:$[^']* "'" { return { type: 'Str', value: chars }; }

Bool
  = "true" !IdentChar { return { type: 'Bool', value: true }; }
  / "false" !IdentChar { return { type: 'Bool', value: false }; }

Identifier
  = name:RawIdent { return { type: 'Ident', name }; }

RawIdent
  = !Reserved chars:$([a-zA-Z_][a-zA-Z0-9_]*) { return chars; }

Reserved
  = ("and" / "or" / "not" / "true" / "false") !IdentChar

IdentChar = [a-zA-Z0-9_]

_  = (Spc / LineComment)*
__ = (Spc / LineComment / NL)*

Spc = [ \t]
LineComment = "//" [^\n]*
NL = "\r"? "\n"
`;
