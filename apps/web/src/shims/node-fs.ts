// Browser-safe shim for node:fs.
// The real fs module is only used server-side in @tv/core/env.ts for reading .env files.
// This stub allows the module to load in the browser without crashing.

export function readFileSync(_path: string, _encoding?: string): string {
  return '';
}

export function existsSync(_path: string): boolean {
  return false;
}

export function statSync(_path: string): { isDirectory(): boolean; isFile(): boolean } {
  return { isDirectory: () => false, isFile: () => false };
}
