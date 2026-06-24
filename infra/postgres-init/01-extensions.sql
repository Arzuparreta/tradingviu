-- Extensions and base config applied at first init.
-- TimescaleDB image ships with the extension; we just enable it per-db.

\connect tradingviu

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
