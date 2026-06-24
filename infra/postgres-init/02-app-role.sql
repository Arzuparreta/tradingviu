-- Create the runtime app role (non-superuser, RLS-enforced).
-- Idempotent so it can be re-run safely.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tv_app') THEN
    CREATE ROLE tv_app LOGIN PASSWORD 'change-me-app';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE tradingviu TO tv_app;
GRANT USAGE ON SCHEMA public TO tv_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tv_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tv_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tv_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tv_app;
