import { loader } from '@monaco-editor/react';
// Import the trimmed editor API (no built-in languages) — we register our own
// `pine` language, so bundling perl/ruby/sql/etc. would be dead weight.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Bundle Monaco locally (no CDN). We only need the core editor worker since
// the Pine language uses our own Monarch tokenizer, not a language service.
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};
loader.config({ monaco });

const BASE_VARS = ['open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4', 'na'];
const FUNCTIONS = [
  'indicator', 'strategy', 'plot', 'hline', 'plotshape',
  'input.int', 'input.float', 'input.bool', 'input.string', 'input.source',
  'ta.sma', 'ta.ema', 'ta.wma', 'ta.rma', 'ta.rsi', 'ta.stdev', 'ta.change', 'ta.highest', 'ta.lowest', 'ta.atr',
  'math.abs', 'math.sqrt', 'math.round', 'math.floor', 'math.ceil', 'math.pow', 'math.max', 'math.min',
  'nz', 'na',
];
const COLORS = ['color.red', 'color.green', 'color.blue', 'color.orange', 'color.purple', 'color.yellow', 'color.gray', 'color.white', 'color.black'];

let registered = false;

/** Register the `pine` language (highlighting + completions). Idempotent. */
export const registerPine = (m: typeof monaco): void => {
  if (registered) return;
  registered = true;

  m.languages.register({ id: 'pine' });

  m.languages.setMonarchTokensProvider('pine', {
    keywords: ['and', 'or', 'not', 'if', 'else', 'for', 'while', 'var', 'varip', 'true', 'false', 'na'],
    namespaces: ['ta', 'math', 'input', 'color', 'str', 'request', 'strategy'],
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\b\d+(\.\d+)?\b/, 'number'],
        [/[a-zA-Z_]\w*(?=\s*\()/, 'function'],
        [/[a-zA-Z_]\w*(?=\.)/, { cases: { '@namespaces': 'type', '@default': 'identifier' } }],
        [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/[=<>!+\-*/%?:]/, 'operator'],
      ],
    },
  });

  m.languages.registerCompletionItemProvider('pine', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const kind = m.languages.CompletionItemKind;
      const suggestions = [
        ...FUNCTIONS.map((label) => ({ label, kind: kind.Function, insertText: label, range })),
        ...BASE_VARS.map((label) => ({ label, kind: kind.Variable, insertText: label, range })),
        ...COLORS.map((label) => ({ label, kind: kind.Color, insertText: label, range })),
      ];
      return { suggestions };
    },
  });
};
