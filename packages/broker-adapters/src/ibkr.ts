import { z } from 'zod';
import {
  BrokerAccountSchema,
  BrokerHealthSchema,
  BrokerOrderSchema,
  BrokerPositionSchema,
  type BrokerAccount,
  type BrokerHealth,
  type BrokerOrder,
  type BrokerPosition,
  type IbkrCredentials,
  type PlaceBrokerOrder,
} from '@tv/core';
import { checkedJson, optionalFinite, parseFinite } from './http.js';
import { BrokerAdapterError, type BrokerAdapter, type FetchLike } from './types.js';

const IbkrAccountPayloadSchema = z.object({
  accountId: z.string(),
  accountTitle: z.string().optional(),
  currency: z.string().default('USD'),
});

const IbkrAuthStatusSchema = z.object({
  authenticated: z.boolean().optional(),
  connected: z.boolean().optional(),
});

const IbkrPositionPayloadSchema = z.object({
  acctId: z.string().optional(),
  contractDesc: z.string().optional(),
  ticker: z.string().optional(),
  position: z.union([z.string(), z.number()]),
  avgCost: z.union([z.string(), z.number()]).optional(),
  mktPrice: z.union([z.string(), z.number()]).optional(),
  mktValue: z.union([z.string(), z.number()]).optional(),
  unrealizedPnl: z.union([z.string(), z.number()]).optional(),
});

const IbkrOrderPayloadSchema = z.object({
  id: z.string().optional(),
  order_id: z.string().optional(),
  local_order_id: z.string().optional(),
  status: z.string().optional(),
  message: z.array(z.string()).optional(),
});

export class IbkrAdapter implements BrokerAdapter {
  readonly id = 'ibkr' as const;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(
    private readonly credentials: IbkrCredentials,
    opts: { fetcher?: FetchLike; baseUrl?: string } = {},
  ) {
    this.baseUrl = (opts.baseUrl ?? credentials.baseUrl).replace(/\/$/, '');
    this.fetcher = opts.fetcher ?? fetch;
  }

  async healthCheck(): Promise<BrokerHealth> {
    const started = Date.now();
    try {
      const raw = await checkedJson(
        this.id,
        this.fetcher,
        `${this.baseUrl}/iserver/auth/status`,
        {},
        IbkrAuthStatusSchema,
      );
      return BrokerHealthSchema.parse({
        broker: this.id,
        ok: raw.authenticated === true || raw.connected === true,
        latencyMs: Date.now() - started,
        message:
          raw.authenticated === true || raw.connected === true
            ? undefined
            : 'IBKR gateway is not authenticated',
      });
    } catch (cause) {
      return BrokerHealthSchema.parse({
        broker: this.id,
        ok: false,
        latencyMs: Date.now() - started,
        message: cause instanceof Error ? cause.message : 'IBKR health check failed',
      });
    }
  }

  async getAccounts(): Promise<BrokerAccount[]> {
    const raw = await checkedJson(
      this.id,
      this.fetcher,
      `${this.baseUrl}/portfolio/accounts`,
      {},
      z.array(IbkrAccountPayloadSchema),
    );
    return raw.map((account) =>
      BrokerAccountSchema.parse({
        id: account.accountId,
        broker: this.id,
        name: account.accountTitle ?? account.accountId,
        currency: account.currency,
        equity: 0,
        cash: 0,
        buyingPower: 0,
        status: 'active',
        raw: account,
      }),
    );
  }

  async getPositions(accountId = this.credentials.accountId): Promise<BrokerPosition[]> {
    if (!accountId) throw new BrokerAdapterError(this.id, 'accountId is required for positions');
    const raw = await checkedJson(
      this.id,
      this.fetcher,
      `${this.baseUrl}/portfolio/${encodeURIComponent(accountId)}/positions/0`,
      {},
      z.array(IbkrPositionPayloadSchema),
    );
    return raw.map((position) =>
      BrokerPositionSchema.parse({
        broker: this.id,
        accountId: position.acctId ?? accountId,
        symbol: position.ticker ?? position.contractDesc ?? 'UNKNOWN',
        quantity: parseFinite(position.position),
        averagePrice: optionalFinite(position.avgCost),
        marketPrice: optionalFinite(position.mktPrice),
        marketValue: optionalFinite(position.mktValue),
        unrealizedPnl: optionalFinite(position.unrealizedPnl),
        raw: position,
      }),
    );
  }

  async placeOrder(
    order: PlaceBrokerOrder,
    accountId = this.credentials.accountId,
  ): Promise<BrokerOrder> {
    if (!accountId) throw new BrokerAdapterError(this.id, 'accountId is required for orders');
    const raw = await checkedJson(
      this.id,
      this.fetcher,
      `${this.baseUrl}/iserver/account/${encodeURIComponent(accountId)}/orders`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: [
            {
              ticker: order.symbol,
              side: order.side.toUpperCase(),
              orderType: order.type.toUpperCase(),
              quantity: order.quantity,
              tif: order.timeInForce.toUpperCase(),
              ...(order.limitPrice !== undefined ? { price: order.limitPrice } : {}),
            },
          ],
        }),
      },
      z.array(IbkrOrderPayloadSchema).min(1),
    );
    const first = raw[0]!;
    return BrokerOrderSchema.parse({
      id: first.order_id ?? first.local_order_id ?? first.id ?? 'pending',
      broker: this.id,
      accountId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      quantity: order.quantity,
      ...(order.limitPrice !== undefined ? { limitPrice: order.limitPrice } : {}),
      status: normalizeIbkrStatus(first.status),
      raw: first,
    });
  }

  async cancelOrder(orderId: string, accountId = this.credentials.accountId): Promise<void> {
    if (!accountId) throw new BrokerAdapterError(this.id, 'accountId is required for cancel');
    const response = await this.fetcher(
      `${this.baseUrl}/iserver/account/${encodeURIComponent(accountId)}/order/${encodeURIComponent(orderId)}`,
      { method: 'DELETE' },
    );
    if (!response.ok)
      throw new BrokerAdapterError(this.id, `cancel failed: HTTP ${response.status}`);
  }
}

const normalizeIbkrStatus = (status: string | undefined): BrokerOrder['status'] => {
  if (!status) return 'new';
  const lower = status.toLowerCase();
  if (lower.includes('filled')) return lower.includes('partial') ? 'partially_filled' : 'filled';
  if (lower.includes('cancel')) return 'canceled';
  if (lower.includes('reject')) return 'rejected';
  if (lower.includes('expire')) return 'expired';
  return 'new';
};
