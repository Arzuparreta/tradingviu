import peggy from 'peggy';
import { GRAMMAR } from './grammar.js';
import { PineParseError, type Program } from './ast.js';

export * from './ast.js';

// Generate the parser once at module load (no build step; works under Bun/tsx).
const parser = peggy.generate(GRAMMAR);

/** Read the `//@version=N` directive, or null when absent. */
export const extractVersion = (source: string): number | null => {
  const m = source.match(/\/\/@version\s*=\s*(\d+)/);
  return m && m[1] !== undefined ? parseInt(m[1], 10) : null;
};

interface PeggyError {
  message: string;
  location?: { start: { line: number; column: number } };
}

/** Parse Pine source into a typed AST. Throws {@link PineParseError} on syntax errors. */
export const parse = (source: string): Program => {
  let program: Program;
  try {
    program = parser.parse(source) as Program;
  } catch (e) {
    const err = e as PeggyError;
    const loc = err.location
      ? { line: err.location.start.line, column: err.location.start.column }
      : undefined;
    throw new PineParseError(err.message, loc);
  }
  program.version = extractVersion(source);
  return program;
};
