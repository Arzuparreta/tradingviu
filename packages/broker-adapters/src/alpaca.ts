import { z } from 'zod';
import {
  BrokerAccountSchema,
  BrokerHealthSchema,
  BrokerOrderSchema,
  BrokerPositionSchema,
  type AlpacaCredentials,
  type BrokerAccount,
  type BrokerHealth,
  type BrokerOrder,
  type BrokerPosition,
  type PlaceBrokerOrder,
} from '@tv/core';
import { checkedJson, optionalFinite, parseFinite } from './http.js';
import { BrokerAdapterError, type BrokerAdapter, type FetchLike } from './types.js';

const AlpacaAccountPayloadSchema = z.object({
  id: z.string(),
  account_number: z.string().optional(),
  currency: z.string().default('USD'),
  equity: z.union([z.string(), z.number()]),
  cash: z.union([z.string(), z.number()]),
  buying_power: z.union([z.string(), z.number()]),
  status: z.string(),
});

const AlpacaPositionPayloadSchema = z.object({
  symbol: z.string(),
  qty: z.union([z.string(), z.number()]),
  avg_entry_price: z.union([z.string(), z.number()]).optional(),
  current_price: z.union([z.string(), z.number()]).optional(),
  market_value: z.union([z.string(), z.number()]).optional(),
  unrealized_pl: z.union([z.string(), z.number()]).optional(),
});

const AlpacaOrderPayloadSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: z.enum(['buy', 'sell']),
  type: z.enum(['market', 'limit']),
  qty: z.union([z.string(), z.number()]),
  limit_price: z.union([z.string(), z.number()]).nullable().optional(),
  status: z.string(),
  submitted_at: z.string().nullable().optional(),
});

export class AlpacaAdapter implements BrokerAdapter {
  readonly id = 'alpaca' as const;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly headers: HeadersInit;

  constructor(
    credentials: AlpacaCredentials,
    opts: { fetcher?: FetchLike; baseUrl?: string } = {},
  ) {
    this.baseUrl =
      opts.baseUrl ??
      (credentials.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets');
    this.fetcher = opts.fetcher ?? fetch;
    this.headers = {
      'APCA-API-KEY-ID': credentials.apiKey,
      'APCA-API-SECRET-KEY': credentials.secretKey,
      'Content-Type': 'application/json',
    };
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
        message: cause instanceof Error ? cause.message : 'Alpaca health check failed',
      });
    }
  }

  async getAccounts(): Promise<BrokerAccount[]> {
    const raw = await checkedJson(
      this.id,
      this.fetcher,
      `${this.baseUrl}/v2/account`,
      { headers: this.headers },
      AlpacaAccountPayloadSchema,
    );
    return [
      BrokerAccountSchema.parse({
        id: raw.account_number ?? raw.id,
        broker: this.id,
        name: `Alpaca ${raw.account_number ?? raw.id}`,
        currency: raw.currency,
        equity: parseFinite(raw.equity),
        cash: parseFinite(raw.cash),
        buyingPower: parseFinite(raw.buying_power),
        status: raw.status,
        raw,
      }),
    ];
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const raw = await checkedJson(
      this.id,
      this.fetcher,
      `${this.baseUrl}/v2/positions`,
      { headers: this.headers },
      z.array(AlpacaPositionPayloadSchema),
    );
    return raw.map((p) =>
      BrokerPositionSchema.parse({
        broker: this.id,
        symbol: p.symbol,
        quantity: parseFinite(p.qty),
        averagePrice: optionalFinite(p.avg_entry_price),
        marketPrice: optionalFinite(p.current_price),
        marketValue: optionalFinite(p.market_value),
        unrealizedPnl: optionalFinite(p.unrealized_pl),
        raw: p,
      }),
    );
  }

  async placeOrder(order: PlaceBrokerOrder): Promise<BrokerOrder> {
    const raw = await checkedJson(
      this.id,
      this.fetcher,
      `${this.baseUrl}/v2/orders`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          symbol: order.symbol,
          qty: String(order.quantity),
          side: order.side,
          type: order.type,
          time_in_force: order.timeInForce,
          ...(order.limitPrice !== undefined ? { limit_price: String(order.limitPrice) } : {}),
        }),
      },
      AlpacaOrderPayloadSchema,
    );
    return BrokerOrderSchema.parse({
      id: raw.id,
      broker: this.id,
      symbol: raw.symbol,
      side: raw.side,
      type: raw.type,
      quantity: parseFinite(raw.qty),
      limitPrice: optionalFinite(raw.limit_price),
      status: normalizeAlpacaStatus(raw.status),
      ...(raw.submitted_at ? { submittedAt: raw.submitted_at } : {}),
      raw,
    });
  }

  async cancelOrder(orderId: string): Promise<void> {
    const response = await this.fetcher(
      `${this.baseUrl}/v2/orders/${encodeURIComponent(orderId)}`,
      {
        method: 'DELETE',
        headers: this.headers,
      },
    );
    if (!response.ok)
      throw new BrokerAdapterError(this.id, `cancel failed: HTTP ${response.status}`);
  }
}

const normalizeAlpacaStatus = (status: string): BrokerOrder['status'] => {
  if (status === 'partially_filled') return 'partially_filled';
  if (status === 'filled') return 'filled';
  if (status === 'canceled' || status === 'cancelled') return 'canceled';
  if (status === 'rejected') return 'rejected';
  if (status === 'expired') return 'expired';
  return 'new';
};
