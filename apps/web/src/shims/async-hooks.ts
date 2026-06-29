// Browser-safe shim for node:async_hooks.
// The real AsyncLocalStorage is only used server-side in middleware/user-context.ts.
// This stub allows @tv/core/user-context.ts to load in the browser without crashing.
// Server code never calls these from the client; tree-shaking removes them in prod builds.

export class AsyncLocalStorage<T> {
  private _store: T | undefined;
  getStore(): T | undefined {
    return this._store;
  }
  run(store: T, fn: () => unknown): unknown {
    this._store = store;
    try {
      return fn();
    } finally {
      this._store = undefined;
    }
  }
  disable(): void {
    this._store = undefined;
  }
  enterWith(_store: T): void {}
  exit(fn: () => unknown): unknown {
    return fn();
  }
}
