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
ALTER TABLE "fundamental_snapshots" ADD CONSTRAINT "fundamental_snapshots_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fundamentals_symbol_period_idx" ON "fundamental_snapshots" USING btree ("symbol_id","fiscal_period","period_end");--> statement-breakpoint
CREATE INDEX "fundamentals_latest_idx" ON "fundamental_snapshots" USING btree ("symbol_id","fiscal_period","is_latest");--> statement-breakpoint
CREATE UNIQUE INDEX "fundamentals_symbol_period_end_uq" ON "fundamental_snapshots" USING btree ("symbol_id","fiscal_period","period_end");