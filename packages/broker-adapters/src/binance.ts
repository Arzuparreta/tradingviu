import { createHmac } from 'node:crypto';
import { z } from 'zod';
import {
  BrokerAccountSchema,
  BrokerHealthSchema,
  BrokerOrderSchema,
  BrokerPositionSchema,
  type BinanceCredentials,
  type BrokerAccount,
  type BrokerHealth,
  type BrokerOrder,
  type BrokerPosition,
  type PlaceBrokerOrder,
} from '@tv/core';
import { buildQuery, checkedJson, optionalFinite, parseFinite } from './http.js';
import { BrokerAdapterError, type BrokerAdapter, type FetchLike } from './types.js';

const BinanceAccountPayloadSchema = z.object({
  accountType: z.string().default('SPOT'),
  balances: z.array(
    z.object({
      asset: z.string(),
      free: z.union([z.string(), z.number()]),
      locked: z.union([z.string(), z.number()]),
    }),
  ),
});

const BinanceOrderPayloadSchema = z.object({
  orderId: z.union([z.string(), z.number()]),
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['MARKET', 'LIMIT']),
  origQty: z.union([z.string(), z.number()]),
  price: z.union([z.string(), z.number()]).optional(),
  status: z.string(),
  transactTime: z.number().optional(),
});

export class BinanceAdapter implements BrokerAdapter {
  readonly id = 'binance' as const;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(
    private readonly credentials: BinanceCredentials,
    opts: { fetcher?: FetchLike; baseUrl?: string } = {},
  ) {
    this.baseUrl =
      opts.baseUrl ??
      (credentials.testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com');
    this.fetcher = opts.fetcher ?? fetch;
  }

  async healthCheck(): Promise<BrokerHealth> {
    const started = Date.now();
    try {
      await this.getAccounts();
      return BrokerHealthSchema.parse({
        broker: this.id,
        ok: true,
        latencyMs: Date.now() - started,
      });
    } catch (cause) {
      return BrokerHealthSchema.parse({
        broker: this.id,
        ok: false,
        latencyMs: Date.now() - started,
        message: cause instanceof Error ? cause.message : 'Binance health check failed',
      });
    }
  }

  async getAccounts(): Promise<BrokerAccount[]> {
    const raw = await this.signedGet('/api/v3/account', BinanceAccountPayloadSchema);
    const usdt = raw.balances.find((b) => b.asset === 'USDT');
    const cash = usdt ? parseFinite(usdt.free) : 0;
    const locked = usdt ? parseFinite(usdt.locked) : 0;
    return [
      BrokerAccountSchema.parse({
        id: raw.accountType,
        broker: this.id,
        name: `Binance ${raw.accountType}`,
        currency: 'USDT',
        equity: cash + locked,
        cash,
        buyingPower: cash,
        status: 'active',
        raw,
      }),
    ];
  }

  async getPositions(accountId = 'SPOT'): Promise<BrokerPosition[]> {
    const raw = await this.signedGet('/api/v3/account', BinanceAccountPayloadSchema);
    return raw.balances
      .map((balance) => ({
        asset: balance.asset,
        quantity: parseFinite(balance.free) + parseFinite(balance.locked),
        raw: balance,
      }))
      .filter((balance) => balance.quantity > 0)
      .map((balance) =>
        BrokerPositionSchema.parse({
          broker: this.id,
          accountId,
          symbol: balance.asset,
          quantity: balance.quantity,
          raw: balance.raw,
        }),
      );
  }

  async placeOrder(order: PlaceBrokerOrder, accountId?: string): Promise<BrokerOrder> {
    const raw = await this.signedPost('/api/v3/order', {
      symbol: order.symbol,
      side: order.side.toUpperCase(),
      type: order.type.toUpperCase(),
      quantity: order.quantity,
      ...(order.type === 'limit' ? { timeInForce: 'GTC', price: order.limitPrice } : {}),
    });
    return BrokerOrderSchema.parse({
      id: String(raw.orderId),
      broker: this.id,
      accountId,
      symbol: raw.symbol,
      side: raw.side === 'BUY' ? 'buy' : 'sell',
      type: raw.type === 'MARKET' ? 'market' : 'limit',
      quantity: parseFinite(raw.origQty),
      limitPrice: optionalFinite(raw.price),
      status: normalizeBinanceStatus(raw.status),
      ...(raw.transactTime !== undefined ? { submittedAt: new Date(raw.transactTime) } : {}),
      raw,
    });
  }

  async cancelOrder(orderId: string): Promise<void> {
    const response = await this.fetcher(
      `${this.baseUrl}/api/v3/order?${this.sign({ orderId, timestamp: Date.now() })}`,
      {
        method: 'DELETE',
        headers: { 'X-MBX-APIKEY': this.credentials.apiKey },
      },
    );
    if (!response.ok)
      throw new BrokerAdapterError(this.id, `cancel failed: HTTP ${response.status}`);
  }

  private async signedGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return checkedJson(
      this.id,
      this.fetcher,
      `${this.baseUrl}${path}?${this.sign({ timestamp: Date.now() })}`,
      {
        headers: { 'X-MBX-APIKEY': this.credentials.apiKey },
      },
      schema,
    );
  }

  private async signedPost(path: string, params: Record<string, string | number | undefined>) {
    return checkedJson(
      this.id,
      this.fetcher,
      `${this.baseUrl}${path}?${this.sign({ ...params, timestamp: Date.now() })}`,
      { method: 'POST', headers: { 'X-MBX-APIKEY': this.credentials.apiKey } },
      BinanceOrderPayloadSchema,
    );
  }

  private sign(params: Record<string, string | number | undefined>): string {
    const query = buildQuery(params);
    const signature = createHmac('sha256', this.credentials.secretKey).update(query).digest('hex');
    return `${query}&signature=${signature}`;
  }
}

const normalizeBinanceStatus = (status: string): BrokerOrder['status'] => {
  if (status === 'PARTIALLY_FILLED') return 'partially_filled';
  if (status === 'FILLED') return 'filled';
  if (status === 'CANCELED') return 'canceled';
  if (status === 'REJECTED') return 'rejected';
  if (status === 'EXPIRED') return 'expired';
  return 'new';
};
