import type {
  BrokerAccount,
  BrokerHealth,
  BrokerId,
  BrokerOrder,
  BrokerPosition,
  PlaceBrokerOrder,
} from '@tv/core';

export interface BrokerAdapter {
  readonly id: BrokerId;
  healthCheck(): Promise<BrokerHealth>;
  getAccounts(): Promise<BrokerAccount[]>;
  getPositions(accountId?: string): Promise<BrokerPosition[]>;
  placeOrder(order: PlaceBrokerOrder, accountId?: string): Promise<BrokerOrder>;
  cancelOrder(orderId: string, accountId?: string): Promise<void>;
}

export class BrokerAdapterError extends Error {
  public override readonly name = 'BrokerAdapterError';
  public readonly broker: BrokerId;
  public override readonly cause?: unknown;

  constructor(broker: BrokerId, message: string, cause?: unknown) {
    super(`[${broker}] ${message}`);
    this.broker = broker;
    if (cause !== undefined) this.cause = cause;
  }
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
