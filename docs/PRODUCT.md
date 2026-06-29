# Product Direction

tradingviu is a personal, self-hosted market terminal. It is not a brokerage,
portfolio tracker, research notebook, paper-trading sandbox, options lab, Pine
editor, or backtesting product.

It should feel like a lean TradingView-style command center for one owner who
wants to watch assets closely: charts, watchlists, alerts, layouts, live market
data, news, macro, calendars, and clean discovery.

## North Star

One calm, professional market screen that answers: what is moving, why does it
matter, and where should I look next?

The chart is the center of the product. Everything else supports chart-driven
market monitoring:

- watchlists to define the owner’s universe;
- multi-chart layouts to compare symbols and timeframes;
- alerts to notify when levels matter;
- discovery to surface real news, macro events, market catalysts, and important
  tracked assets;
- symbol search, quote streams, indicators, drawings, and market profiles as
  chart-native tools.

## Non-Goals

These are out of scope for the product. Do not add new surfaces, nav entries,
API routes, docs promises, or architectural constraints for them.

- broker connections;
- order placement;
- paper trading;
- portfolios, holdings, transactions, allocation, or P&L tracking;
- options pricing or options strategies;
- Pine editor/runtime as a user-facing feature;
- strategy builders, backtesting, optimization, or walk-forward reports;
- papers, documents, notebooks, marketplace, social, billing, SaaS, tenants,
  quotas, or public API token products.

Historical migration snapshots may mention retired surfaces because they describe
past database state. They are not product direction and must not be reused as a
reason to rebuild those features.

## Active Surfaces

- **Dashboard** — compact market desk: watchlist, live status, alerts, calendar
  catalysts, and latest market news.
- **Chart** — primary single-symbol workspace with professional charting,
  indicators, drawings, profiles, patterns, and depth.
- **Watchlists** — owner-defined market universe.
- **Discovery** — real market news, macro/rates, catalysts, and clean asset
  discovery across the asset classes the terminal tracks.
- **Layouts** — multi-chart monitoring with independent panels and only the sync
  behavior that is explicitly useful.
- **Alerts** — price and chart-condition notifications.

## Discovery Direction

Discovery is not a generic screener builder and not a research dumping ground.
It should be an operator’s market briefing:

- latest indexed news with source, timestamp, sentiment, and affected symbols;
- high-importance macro events and upcoming earnings/catalysts;
- rates and macro indicators that matter for cross-asset context;
- a small asset board for equities, crypto, indices, FX, and other tracked
  classes as support is added;
- minimal controls: asset class, symbol/search, country, and time horizon.

Use real indexed/provider data. If there is no data, show a truthful empty state
and keep ingestion/provider setup as the fix. Do not invent filler content.

## Design Feel

- Dense but calm, like a professional terminal used repeatedly.
- Dark, fast, keyboard-friendly, and stable under live updates.
- Sleek without decoration: color is signal, not mood.
- Few panels, clear hierarchy, no nested cards, no marketing copy.
- Every route should look like the same product, not a pile of feature demos.

## Ownership Model

One owner, one machine, one local workspace. Request context is `{ userId }`;
user-created data scopes by `user_id`. Anything about tenants, billing,
super-admin, public `/v1` APIs, or marketplace surfaces is dead history.
