import type { Bar, BarQuery, Symbol, ProviderCapabilities, ProviderHealth } from '@tv/data-types';
import type { Interval } from '@tv/core';

export interface DataProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  fetchSymbols(): Promise<Symbol[]>;
  fetchHistorical(q: BarQuery): Promise<Bar[]>;
  subscribe?(symbol: Symbol, onBar: (b: Bar) => void, interval?: Interval): () => void;
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
