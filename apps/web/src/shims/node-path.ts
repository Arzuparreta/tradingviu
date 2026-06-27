// Browser-safe shims for Node built-in modules pulled in via @tv/core barrel exports.
// These modules are only used server-side; the shims prevent Vite build failures
// and runtime crashes when the browser loads @tv/core.

export function resolve(...segments: string[]): string {
  return segments.join('/').replace(/\/+/g, '/');
}

export function dirname(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx === -1 ? '.' : p.slice(0, idx);
}

export function join(...segments: string[]): string {
  return segments.join('/').replace(/\/+/g, '/');
}

export function basename(p: string, ext?: string): string {
  const idx = p.lastIndexOf('/');
  let base = idx === -1 ? p : p.slice(idx + 1);
  if (ext && base.endsWith(ext)) base = base.slice(0, -ext.length);
  return base;
}

export const sep = '/';
export const delimiter = ':';
