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
CREATE INDEX "macro_series_country_metric_date_idx" ON "macro_series_observations" USING btree ("country","metric_code","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "macro_series_point_uq" ON "macro_series_observations" USING btree ("country","metric_code","observed_at","source");--> statement-breakpoint
CREATE INDEX "yield_curves_country_date_idx" ON "yield_curves" USING btree ("country","curve_date");--> statement-breakpoint
CREATE UNIQUE INDEX "yield_curves_point_uq" ON "yield_curves" USING btree ("country","curve_date","tenor_months","source");