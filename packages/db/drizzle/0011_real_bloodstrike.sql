ALTER TABLE "drawings" ADD COLUMN "scope_id" text;--> statement-breakpoint
UPDATE "drawings" SET "scope_id" = 'symbol:' || "symbol_id" || ':' || "interval" WHERE "scope_id" IS NULL;--> statement-breakpoint
ALTER TABLE "drawings" ALTER COLUMN "scope_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "drawings_tenant_scope_idx" ON "drawings" USING btree ("tenant_id","user_id","scope_id");
