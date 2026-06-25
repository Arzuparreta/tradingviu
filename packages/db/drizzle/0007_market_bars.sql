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
CREATE INDEX "bars_lookup_idx" ON "bars" USING btree ("provider","ticker","interval","time");
--> statement-breakpoint
SELECT create_hypertable('bars', 'time',
  chunk_time_interval => 86400,
  if_not_exists => TRUE);
--> statement-breakpoint
ALTER TABLE "bars" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bars" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "bars_read" ON "bars";
--> statement-breakpoint
CREATE POLICY "bars_read" ON "bars" FOR SELECT USING (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "bars_write" ON "bars";
--> statement-breakpoint
CREATE POLICY "bars_write" ON "bars" FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "bars" TO tv_app;