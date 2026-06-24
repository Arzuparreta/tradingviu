# Pine Script v5 subset — grammar reference

`@tv/pine-parser` implements a **subset** of Pine Script v5 as a peggy PEG grammar
(`src/grammar.ts`), producing the typed AST in `src/ast.ts`. The interpreter that
walks this AST lives in `@tv/pine-runtime`.

**Check this file before adding syntax.** Keep the grammar, the AST, and the runtime
in sync — a new node type means a new `evaluate` case.

## Supported

| Feature | Example |
|---|---|
| Version directive | `//@version=5` |
| Line comments | `// note` (also trailing: `plot(x) // note`) |
| Declarations | `len = 14`, `out = ta.sma(close, len)` |
| Expression statements | `plot(out)`, `indicator("x")` |
| Numbers / strings / booleans | `14`, `1.5`, `"RSI"`, `'RSI'`, `true`, `false` |
| `na` literal | `x = na` |
| Member access | `ta.sma`, `color.red`, `math.pi` |
| Function calls | `ta.sma(close, 14)` |
| Positional + named args | `plot(out, title="MA", color=color.blue)` |
| Arithmetic | `+ - * / %` with standard precedence |
| Comparison | `== != < <= > >=` |
| Logical | `and`, `or`, `not` |
| Ternary | `cond ? a : b` (right-associative) |
| Parentheses | `(close + open) / 2` |

### Built-in series (provided by the runtime)

`open`, `high`, `low`, `close`, `volume`, `hl2`, `hlc3`, `ohlc4`.

### Built-in functions (runtime)

- Declaration: `indicator(title, overlay=)`, `strategy(title, overlay=)`
- Inputs: `input.int/float/bool/string/source`, bare `input(...)`
- TA: `ta.sma/ema/wma/rma/rsi/stdev/change/highest/lowest`, `ta.atr(length)`
- Math: `math.abs/sqrt/round/floor/ceil/log/pow/max/min`, `math.pi`, `math.e`
- Misc: `nz(x, repl?)`, `na(x)`, `color.<name>`
- Output: `plot(series, title=, color=)`, `hline(price, title=, color=)`
- Accepted but not rendered (v1 no-ops): `plotshape`, `plotchar`, `bgcolor`

## Not supported (v1)

- Multi-line statements / line continuation (each statement is single-line)
- `:=` reassignment, `var` / `varip`
- `if` / `for` / `while`, user function defs (`f(x) =>`)
- Arrays, maps, matrices, UDTs (planned for the slice 10 Pine v6 work)
- History-referencing operator `[]` (e.g. `close[1]`)
- Tuples / multi-return (`[macd, signal, hist] = ta.macd(...)`)

When you add a builtin, add it to `@tv/pine-runtime`'s `BUILTINS` table and, if it is
a new namespace, to the Monaco language definition in `apps/web/src/lib/monaco-pine.ts`.
