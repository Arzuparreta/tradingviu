INSERT INTO "bars" (
  "provider",
  "ticker",
  "interval",
  "time",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "trades",
  "is_closed",
  "inserted_at"
)
SELECT
  "provider",
  replace("ticker", '/', ''),
  "interval",
  "time",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "trades",
  "is_closed",
  "inserted_at"
FROM "bars"
WHERE "provider" = 'binance'
  AND "ticker" LIKE '%/%'
ON CONFLICT ("provider", "ticker", "interval", "time") DO NOTHING;
--> statement-breakpoint
DELETE FROM "bars"
WHERE "provider" = 'binance'
  AND "ticker" LIKE '%/%';
