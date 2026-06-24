CREATE TABLE "likes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "likes_target_idx" ON "likes" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "likes_user_target_uq" ON "likes" USING btree ("user_id","target_type","target_id");