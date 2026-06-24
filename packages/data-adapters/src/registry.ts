import type { DataProvider } from './provider.js';

export class ProviderRegistry {
  private providers = new Map<string, DataProvider>();

  register(provider: DataProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): DataProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`Unknown provider: ${id}`);
    return p;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  list(): DataProvider[] {
    return Array.from(this.providers.values());
  }
}

export const globalRegistry = new ProviderRegistry();
