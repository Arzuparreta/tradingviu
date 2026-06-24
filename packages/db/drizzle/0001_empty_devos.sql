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
ALTER TABLE "dividend_calendar" ADD CONSTRAINT "dividend_calendar_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dividends_symbol_ex_date_uq" ON "dividend_calendar" USING btree ("symbol_id","ex_date");--> statement-breakpoint
CREATE INDEX "dividends_ex_date_idx" ON "dividend_calendar" USING btree ("ex_date");