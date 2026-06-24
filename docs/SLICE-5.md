# Slice 5 — Brokers + DOM + Options

Slice 5 ("trading desk") is being delivered in sequenced pieces:

1. **5a — Options engine (pricing + greeks + strategy builder + payoff)** ✅ (this commit)
2. **5b — Broker adapters (Alpaca, IBKR Client Portal, Binance live)** ✅
3. 5c — DOM (depth of market) + chart trading — pending

The options engine shipped first because it is pure, deterministic math. Broker adapters are now in place behind encrypted tenant-scoped connections. The next trading-desk slice is DOM + chart trading on top of the broker connection surface.

---

## 5a — Options engine

### What it delivers

A self-hosted options analytics stack: Black-Scholes-Merton pricing, the full greek set, implied volatility, option-chain generation, a 13-strategy builder, and expiration payoff analysis (max profit/loss, breakevens, net greeks) — wired end-to-end to a React page with an SVG payoff diagram.

### Package: `packages/options-engine`

Pure TypeScript, zero runtime dependencies. Mirrors the `@tv/ta-lib` shape (engine package consumed by a server route).

| File                   | What it does                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/black-scholes.ts` | `normCdf` (A&S 26.2.17), `optionPrice`, `optionGreeks` (delta/gamma/theta/vega/rho with continuous dividend yield), `impliedVolatility` (bisection), `intrinsicValue` |
| `src/chain.ts`         | `buildChain` — call/put quotes (price, intrinsic, extrinsic, greeks) per strike per expiry; auto-generates "nice" strikes around spot when none given                 |
| `src/strategy.ts`      | 13 strategy templates, `priceLeg`, `analyzeStrategy` (payoff curve, net greeks, max profit/loss, breakevens), `buildAndAnalyze`                                       |
| `src/types.ts`         | `OptionType`, `OptionSide`, `Greeks`, `BsInput`                                                                                                                       |
| `src/options.test.ts`  | 10 tests — textbook BS values, put-call parity, greeks, IV round-trip, chain symmetry, bull-call-spread + straddle payoff math                                        |

**Greek units:** the engine returns canonical partials — `theta` per year, `vega`/`rho` per 1.00 (100%) move. The UI scales them for traders (theta ÷ 365, vega/rho ÷ 100).

**Strategy templates:** `long_call`, `long_put`, `short_call`, `short_put`, `bull_call_spread`, `bear_call_spread`, `bull_put_spread`, `bear_put_spread`, `straddle`, `strangle`, `iron_condor`, `iron_butterfly`, `call_butterfly`.

**Unbounded tails:** `analyzeStrategy` detects unlimited profit/loss from the payoff slope at the right edge and returns `Infinity` / `-Infinity`. JSON can't represent those, so the route serializes them as `maxProfit: null` + `unlimitedProfit: true` (and the loss equivalent).

### Schemas: `packages/core/src/options-schemas.ts`

`PriceOptionSchema`, `OptionChainSchema`, `AnalyzeStrategySchema` (accepts either a `template` + context, or custom `legs`), `StrategyTemplateSchema`. Exported from `@tv/core`.

### Routes: `apps/server/src/routes/options.ts`

Stateless compute under `/api/*` (auth required, no DB touched):

- `POST /api/options/price` — single option price + greeks + intrinsic/extrinsic
- `POST /api/options/chain` — full chain for the requested expiries/strikes
- `POST /api/options/strategy` — build (template or custom legs), Black-Scholes price each leg, return payoff curve + net greeks + max profit/loss + breakevens

### Web: `apps/web/src/pages/OptionsPage.tsx`

Strategy selector + spot/vol/rate/days/width/contracts inputs → live analysis: net debit/credit, max profit/loss (or "Unlimited"), breakevens, a per-leg table, net greeks (trader-scaled), and an inline SVG payoff diagram with spot and breakeven markers. No chart library — the payoff curve is hand-rolled SVG. Wired into `App.tsx` nav (`/options`) and `apps/web/src/api/client.ts` / `types.ts`.

### Tests

`pnpm --filter @tv/options-engine test` — 10 pass.

### Verification quickstart

```ts
import { buildAndAnalyze, optionPrice } from '@tv/options-engine';

optionPrice({ type: 'call', spot: 100, strike: 100, timeToExpiry: 1, rate: 0.05, volatility: 0.2 });
// → 10.4506 (textbook)

buildAndAnalyze('iron_condor', {
  spot: 100,
  rate: 0.05,
  volatility: 0.3,
  timeToExpiry: 30 / 365,
  width: 5,
});
// → { legs, netDebit (credit), payoff, netGreeks, maxProfit, maxLoss, breakevens }
```

## 5b — Broker adapters

### What it delivers

- `packages/broker-adapters` with a common `BrokerAdapter` contract.
- Alpaca REST adapter for paper/live accounts, positions, orders, cancel, health.
- Binance Spot adapter for testnet/live signed account, balance-as-position, orders, cancel, health.
- IBKR Client Portal Gateway adapter for auth status, accounts, positions, orders, cancel.
- Zod contracts in `packages/core/src/broker-schemas.ts`.
- Tenant-scoped `/api/brokers/*` routes:
  - `GET/POST /api/brokers/connections`
  - `PATCH/DELETE /api/brokers/connections/:id`
  - `POST /api/brokers/connections/:id/test`
  - `GET /api/brokers/connections/:id/accounts`
  - `GET /api/brokers/connections/:id/positions`
  - `POST /api/brokers/connections/:id/orders`
- Credentials are encrypted at rest with libsodium secretbox using `CRED_ENC_KEY` before writing `broker_connections.credentials_encrypted`.
- `apps/web/src/pages/BrokersPage.tsx` provides connect/test/accounts/positions/order placement UI.

### Tests

`pnpm --filter @tv/broker-adapters test` uses mocked `fetch` only. No real broker network calls.

## What's next (5c)

- DOM + chart trading: order ticket on the chart, depth ladder, bracket orders. Reuse the paper-trading fill model for simulated brokers and the 5b broker connection routes for live submission.
