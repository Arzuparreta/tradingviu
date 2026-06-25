import type { Bar, BarQuery, Symbol, ProviderCapabilities, ProviderHealth } from '@tv/data-types';
import type { Interval } from '@tv/core';

export type BarEventKind = 'update' | 'close';

export interface BarEvent {
  kind: BarEventKind;
  bar: Bar;
}

export type BarEventHandler = (event: BarEvent) => void;

export interface DataProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  fetchSymbols(): Promise<Symbol[]>;
  fetchHistorical(q: BarQuery): Promise<Bar[]>;
  /**
   * Subscribe to live bar updates for a symbol+interval.
   *
   * The provider emits a `BarEvent` on every poll (or WS tick). `update`
   * is fired for the in-progress bar and re-fires while the bar's time
   * has not changed. `close` is fired exactly once when the time changes
   * (a new bar started), referring to the previously-in-progress bar.
   */
  subscribe?(symbol: Symbol, onEvent: BarEventHandler, interval?: Interval): () => void;
  healthCheck(): Promise<ProviderHealth>;
}

export class ProviderError extends Error {
  public override readonly name = 'ProviderError';
  public readonly provider: string;
  public override readonly cause?: unknown;
  constructor(provider: string, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.provider = provider;
    if (cause !== undefined) this.cause = cause;
  }
}
