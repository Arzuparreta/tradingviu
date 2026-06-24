import { describe, expect, test } from 'bun:test';
import { AlpacaAdapter } from './alpaca.js';
import { BinanceAdapter } from './binance.js';
import { IbkrAdapter } from './ibkr.js';
import type { FetchLike } from './types.js';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('broker adapters', () => {
  test('maps Alpaca account, positions, and orders', async () => {
    const calls: string[] = [];
    const fetcher: FetchLike = async (input, init) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
      if (String(input).endsWith('/v2/account')) {
        return jsonResponse({
          id: 'uuid',
          account_number: 'PA123',
          currency: 'USD',
          equity: '1000.50',
          cash: '750.25',
          buying_power: '1500.50',
          status: 'ACTIVE',
        });
      }
      if (String(input).endsWith('/v2/positions')) {
        return jsonResponse([
          { symbol: 'AAPL', qty: '2', avg_entry_price: '150', current_price: '160' },
        ]);
      }
      return jsonResponse({
        id: 'ord_1',
        symbol: 'AAPL',
        side: 'buy',
        type: 'market',
        qty: '1',
        status: 'accepted',
      });
    };
    const adapter = new AlpacaAdapter(
      { apiKey: 'k', secretKey: 's', paper: true },
      { fetcher, baseUrl: 'https://alpaca.test' },
    );
    await expect(adapter.getAccounts()).resolves.toEqual([
      expect.objectContaining({ id: 'PA123', broker: 'alpaca', cash: 750.25, buyingPower: 1500.5 }),
    ]);
    await expect(adapter.getPositions()).resolves.toEqual([
      expect.objectContaining({ symbol: 'AAPL', quantity: 2 }),
    ]);
    await expect(
      adapter.placeOrder({
        symbol: 'AAPL',
        side: 'buy',
        type: 'market',
        quantity: 1,
        timeInForce: 'day',
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'ord_1', status: 'new' }));
    expect(calls).toContain('POST https://alpaca.test/v2/orders');
  });

  test('signs Binance account requests and maps balances', async () => {
    const calls: string[] = [];
    const fetcher: FetchLike = async (input) => {
      calls.push(String(input));
      return jsonResponse({
        accountType: 'SPOT',
        balances: [
          { asset: 'USDT', free: '42', locked: '8' },
          { asset: 'BTC', free: '0.5', locked: '0' },
        ],
      });
    };
    const adapter = new BinanceAdapter(
      { apiKey: 'k', secretKey: 's', testnet: true },
      { fetcher, baseUrl: 'https://binance.test' },
    );
    await expect(adapter.getAccounts()).resolves.toEqual([
      expect.objectContaining({ id: 'SPOT', broker: 'binance', equity: 50, cash: 42 }),
    ]);
    await expect(adapter.getPositions()).resolves.toEqual([
      expect.objectContaining({ symbol: 'USDT', quantity: 50 }),
      expect.objectContaining({ symbol: 'BTC', quantity: 0.5 }),
    ]);
    expect(calls[0]).toContain('signature=');
  });

  test('maps IBKR gateway responses', async () => {
    const fetcher: FetchLike = async (input) => {
      const url = String(input);
      if (url.endsWith('/iserver/auth/status')) return jsonResponse({ authenticated: true });
      if (url.endsWith('/portfolio/accounts'))
        return jsonResponse([{ accountId: 'U123', accountTitle: 'Main', currency: 'USD' }]);
      if (url.endsWith('/positions/0'))
        return jsonResponse([{ acctId: 'U123', ticker: 'MSFT', position: '3', avgCost: '250' }]);
      return jsonResponse([{ order_id: 'ib_1', status: 'Submitted' }]);
    };
    const adapter = new IbkrAdapter(
      { baseUrl: 'https://ibkr.test/v1/api', accountId: 'U123' },
      { fetcher },
    );
    await expect(adapter.healthCheck()).resolves.toEqual(
      expect.objectContaining({ broker: 'ibkr', ok: true }),
    );
    await expect(adapter.getAccounts()).resolves.toEqual([
      expect.objectContaining({ id: 'U123', name: 'Main' }),
    ]);
    await expect(adapter.getPositions()).resolves.toEqual([
      expect.objectContaining({ symbol: 'MSFT', quantity: 3 }),
    ]);
    await expect(
      adapter.placeOrder({
        symbol: 'MSFT',
        side: 'sell',
        type: 'limit',
        quantity: 1,
        limitPrice: 300,
        timeInForce: 'day',
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'ib_1', broker: 'ibkr' }));
  });
});
