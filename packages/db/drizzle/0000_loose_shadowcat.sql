CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"bio" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret_encrypted" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchanges" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"type" text NOT NULL,
	"url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbol_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol_id" text NOT NULL,
	"alias" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbols" (
	"id" text PRIMARY KEY NOT NULL,
	"exchange_id" text NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"asset_class" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"base_currency" text,
	"quote_currency" text,
	"country" text,
	"sector" text,
	"industry" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bars" (
	"provider" text NOT NULL,
	"ticker" text NOT NULL,
	"interval" text NOT NULL,
	"time" bigint NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision DEFAULT 0 NOT NULL,
	"trades" bigint,
	"is_closed" boolean DEFAULT true NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bars_provider_ticker_interval_time_pk" PRIMARY KEY("provider","ticker","interval","time")
);
--> statement-breakpoint
CREATE TABLE "data_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol_id" text NOT NULL,
	"intervals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_bar_at" timestamp with time zone,
	"realtime_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_health" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" text,
	"rate_remaining" text,
	"rate_reset" timestamp with time zone,
	"last_error" text,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_history" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"fired_at" timestamp with time zone NOT NULL,
	"price" text,
	"payload" jsonb,
	"delivered" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"condition" jsonb NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"webhook_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"payload" jsonb,
	"ip" text,
	"user_agent" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backtests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"symbol_id" text NOT NULL,
	"interval" text NOT NULL,
	"from_at" timestamp with time zone NOT NULL,
	"to_at" timestamp with time zone NOT NULL,
	"script" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metrics" jsonb,
	"trades" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "broker_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"broker" text NOT NULL,
	"label" text,
	"account_id" text,
	"credentials_encrypted" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dividend_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol_id" text NOT NULL,
	"ex_date" timestamp with time zone NOT NULL,
	"payment_date" timestamp with time zone,
	"record_date" timestamp with time zone,
	"declaration_date" timestamp with time zone,
	"amount" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"frequency" text
);
--> statement-breakpoint
CREATE TABLE "drawings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol_id" text NOT NULL,
	"interval" text NOT NULL,
	"scope_id" text NOT NULL,
	"kind" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"style" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "earnings_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"eps_estimate" text,
	"eps_actual" text,
	"revenue_estimate" text,
	"revenue_actual" text
);
--> statement-breakpoint
CREATE TABLE "economic_events" (
	"id" text PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"name" text NOT NULL,
	"importance" text DEFAULT 'low' NOT NULL,
	"actual" text,
	"forecast" text,
	"previous" text
);
--> statement-breakpoint
CREATE TABLE "fundamental_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol_id" text NOT NULL,
	"fiscal_period" text DEFAULT 'ttm' NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_latest" boolean DEFAULT true NOT NULL,
	"market_cap" double precision,
	"pe_ratio" double precision,
	"eps" double precision,
	"revenue" double precision,
	"dividend_yield" double precision,
	"roe" double precision,
	"revenue_growth" double precision,
	"earnings_growth" double precision,
	"beta" double precision,
	"week_52_high" double precision,
	"week_52_low" double precision,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"symbol_id" text NOT NULL,
	"quantity" text NOT NULL,
	"avg_cost" text,
	"opened_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "layouts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "macro_series_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"metric_code" text NOT NULL,
	"metric_name" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"frequency" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"symbols" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" text,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"balance" text DEFAULT '100000' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"leverage" text DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"symbol_id" text NOT NULL,
	"side" text NOT NULL,
	"type" text NOT NULL,
	"quantity" text NOT NULL,
	"price" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"filled_at" timestamp with time zone,
	"fill_price" text,
	"fee" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"base_currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screener_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"asset_class" text NOT NULL,
	"query" jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"symbol_id" text NOT NULL,
	"side" text NOT NULL,
	"quantity" text NOT NULL,
	"price" text NOT NULL,
	"fee" text DEFAULT '0' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "user_indicators" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"source" text,
	"compiled" jsonb,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"watchlist_id" text NOT NULL,
	"symbol_id" text NOT NULL,
	"color" text,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yield_curves" (
	"id" text PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"curve_date" timestamp with time zone NOT NULL,
	"tenor_months" integer NOT NULL,
	"rate" double precision NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_aliases" ADD CONSTRAINT "symbol_aliases_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbols" ADD CONSTRAINT "symbols_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subscriptions" ADD CONSTRAINT "data_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subscriptions" ADD CONSTRAINT "data_subscriptions_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtests" ADD CONSTRAINT "backtests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtests" ADD CONSTRAINT "backtests_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_connections" ADD CONSTRAINT "broker_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividend_calendar" ADD CONSTRAINT "dividend_calendar_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings_calendar" ADD CONSTRAINT "earnings_calendar_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundamental_snapshots" ADD CONSTRAINT "fundamental_snapshots_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layouts" ADD CONSTRAINT "layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_accounts" ADD CONSTRAINT "paper_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_account_id_paper_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."paper_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screener_presets" ADD CONSTRAINT "screener_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_indicators" ADD CONSTRAINT "user_indicators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "exchanges_code_uq" ON "exchanges" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "symbol_aliases_alias_uq" ON "symbol_aliases" USING btree ("alias","source");--> statement-breakpoint
CREATE INDEX "symbol_aliases_symbol_idx" ON "symbol_aliases" USING btree ("symbol_id");--> statement-breakpoint
CREATE UNIQUE INDEX "symbols_exchange_ticker_uq" ON "symbols" USING btree ("exchange_id","ticker");--> statement-breakpoint
CREATE INDEX "symbols_asset_class_idx" ON "symbols" USING btree ("asset_class");--> statement-breakpoint
CREATE INDEX "symbols_name_idx" ON "symbols" USING btree ("name");--> statement-breakpoint
CREATE INDEX "bars_lookup_idx" ON "bars" USING btree ("provider","ticker","interval","time");--> statement-breakpoint
CREATE UNIQUE INDEX "data_subs_tenant_symbol_uq" ON "data_subscriptions" USING btree ("symbol_id");--> statement-breakpoint
CREATE INDEX "data_subs_tenant_user_idx" ON "data_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "provider_health_provider_idx" ON "provider_health" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "alert_history_alert_idx" ON "alert_history" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "alerts_tenant_user_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alerts_symbol_idx" ON "alerts" USING btree ("symbol_id");--> statement-breakpoint
CREATE INDEX "alerts_active_idx" ON "alerts" USING btree ("active");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "backtests_tenant_user_idx" ON "backtests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "broker_connections_tenant_user_idx" ON "broker_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dividends_symbol_ex_date_uq" ON "dividend_calendar" USING btree ("symbol_id","ex_date");--> statement-breakpoint
CREATE INDEX "dividends_ex_date_idx" ON "dividend_calendar" USING btree ("ex_date");--> statement-breakpoint
CREATE INDEX "drawings_tenant_symbol_idx" ON "drawings" USING btree ("symbol_id");--> statement-breakpoint
CREATE INDEX "drawings_tenant_scope_idx" ON "drawings" USING btree ("user_id","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "earnings_symbol_date_uq" ON "earnings_calendar" USING btree ("symbol_id","date");--> statement-breakpoint
CREATE INDEX "economic_events_country_date_idx" ON "economic_events" USING btree ("country","event_at");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_events_country_event_name_uq" ON "economic_events" USING btree ("country","event_at","name");--> statement-breakpoint
CREATE INDEX "fundamentals_symbol_period_idx" ON "fundamental_snapshots" USING btree ("symbol_id","fiscal_period","period_end");--> statement-breakpoint
CREATE INDEX "fundamentals_latest_idx" ON "fundamental_snapshots" USING btree ("symbol_id","fiscal_period","is_latest");--> statement-breakpoint
CREATE UNIQUE INDEX "fundamentals_symbol_period_end_uq" ON "fundamental_snapshots" USING btree ("symbol_id","fiscal_period","period_end");--> statement-breakpoint
CREATE INDEX "holdings_portfolio_idx" ON "holdings" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "layouts_tenant_user_idx" ON "layouts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "macro_series_country_metric_date_idx" ON "macro_series_observations" USING btree ("country","metric_code","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "macro_series_point_uq" ON "macro_series_observations" USING btree ("country","metric_code","observed_at","source");--> statement-breakpoint
CREATE UNIQUE INDEX "news_articles_url_uq" ON "news_articles" USING btree ("url");--> statement-breakpoint
CREATE INDEX "news_articles_published_idx" ON "news_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "paper_accounts_tenant_user_idx" ON "paper_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "paper_orders_account_idx" ON "paper_orders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "portfolios_tenant_user_idx" ON "portfolios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "screener_tenant_user_idx" ON "screener_presets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_portfolio_idx" ON "transactions" USING btree ("portfolio_id","occurred_at");--> statement-breakpoint
CREATE INDEX "user_indicators_tenant_user_idx" ON "user_indicators" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_items_uq" ON "watchlist_items" USING btree ("watchlist_id","symbol_id");--> statement-breakpoint
CREATE INDEX "watchlists_tenant_user_idx" ON "watchlists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "yield_curves_country_date_idx" ON "yield_curves" USING btree ("country","curve_date");--> statement-breakpoint
CREATE UNIQUE INDEX "yield_curves_point_uq" ON "yield_curves" USING btree ("country","curve_date","tenor_months","source");--> statement-breakpoint
SELECT create_hypertable('bars', 'time', chunk_time_interval => 86400, if_not_exists => TRUE);