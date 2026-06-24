import type { Database } from './client.js';
import { sql } from 'drizzle-orm';

const RLS_SQL = `
-- Helper functions
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')
$$;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')
$$;

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_super_admin', true), '')::boolean, false)
$$;

-- Global tables: no RLS
ALTER TABLE exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchanges FORCE ROW LEVEL SECURITY;
ALTER TABLE symbols ENABLE ROW LEVEL SECURITY;
ALTER TABLE symbols FORCE ROW LEVEL SECURITY;
ALTER TABLE symbol_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE symbol_aliases FORCE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans FORCE ROW LEVEL SECURITY;
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_articles FORCE ROW LEVEL SECURITY;
ALTER TABLE earnings_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_calendar FORCE ROW LEVEL SECURITY;
ALTER TABLE dividend_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE dividend_calendar FORCE ROW LEVEL SECURITY;
ALTER TABLE economic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE economic_events FORCE ROW LEVEL SECURITY;
ALTER TABLE fundamental_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundamental_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE yield_curves ENABLE ROW LEVEL SECURITY;
ALTER TABLE yield_curves FORCE ROW LEVEL SECURITY;
ALTER TABLE macro_series_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE macro_series_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_health FORCE ROW LEVEL SECURITY;

-- RLS policies: read public, super_admin write on global tables
DROP POLICY IF EXISTS exchanges_read ON exchanges;
CREATE POLICY exchanges_read ON exchanges FOR SELECT USING (true);
DROP POLICY IF EXISTS exchanges_write ON exchanges;
CREATE POLICY exchanges_write ON exchanges FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS symbols_read ON symbols;
CREATE POLICY symbols_read ON symbols FOR SELECT USING (true);
DROP POLICY IF EXISTS symbols_write ON symbols;
CREATE POLICY symbols_write ON symbols FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS symbol_aliases_read ON symbol_aliases;
CREATE POLICY symbol_aliases_read ON symbol_aliases FOR SELECT USING (true);
DROP POLICY IF EXISTS symbol_aliases_write ON symbol_aliases;
CREATE POLICY symbol_aliases_write ON symbol_aliases FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS plans_read ON plans;
CREATE POLICY plans_read ON plans FOR SELECT USING (is_public OR is_super_admin());
DROP POLICY IF EXISTS plans_write ON plans;
CREATE POLICY plans_write ON plans FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS news_read ON news_articles;
CREATE POLICY news_read ON news_articles FOR SELECT USING (true);
DROP POLICY IF EXISTS news_write ON news_articles;
CREATE POLICY news_write ON news_articles FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS earnings_read ON earnings_calendar;
CREATE POLICY earnings_read ON earnings_calendar FOR SELECT USING (true);
DROP POLICY IF EXISTS earnings_write ON earnings_calendar;
CREATE POLICY earnings_write ON earnings_calendar FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS dividends_read ON dividend_calendar;
CREATE POLICY dividends_read ON dividend_calendar FOR SELECT USING (true);
DROP POLICY IF EXISTS dividends_write ON dividend_calendar;
CREATE POLICY dividends_write ON dividend_calendar FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS economic_read ON economic_events;
CREATE POLICY economic_read ON economic_events FOR SELECT USING (true);
DROP POLICY IF EXISTS economic_write ON economic_events;
CREATE POLICY economic_write ON economic_events FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS fundamentals_read ON fundamental_snapshots;
CREATE POLICY fundamentals_read ON fundamental_snapshots FOR SELECT USING (true);
DROP POLICY IF EXISTS fundamentals_write ON fundamental_snapshots;
CREATE POLICY fundamentals_write ON fundamental_snapshots FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS yield_curves_read ON yield_curves;
CREATE POLICY yield_curves_read ON yield_curves FOR SELECT USING (true);
DROP POLICY IF EXISTS yield_curves_write ON yield_curves;
CREATE POLICY yield_curves_write ON yield_curves FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS macro_series_read ON macro_series_observations;
CREATE POLICY macro_series_read ON macro_series_observations FOR SELECT USING (true);
DROP POLICY IF EXISTS macro_series_write ON macro_series_observations;
CREATE POLICY macro_series_write ON macro_series_observations FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS provider_health_read ON provider_health;
CREATE POLICY provider_health_read ON provider_health FOR SELECT USING (is_super_admin());

-- Tenant-scoped tables (have tenant_id column)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'api_keys',
    'data_subscriptions',
    'layouts','drawings','alerts','alert_history',
    'screener_presets','user_indicators','backtests',
    'ideas','comments','follows','published_scripts',
    'portfolios','holdings','transactions',
    'watchlists','watchlist_items',
    'paper_accounts','paper_orders','broker_connections',
    'subscriptions','audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_iso ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_iso ON %I FOR ALL '
      'USING (tenant_id = current_tenant_id() OR is_super_admin()) '
      'WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin())',
      t, t
    );
  END LOOP;
END $$;

-- Tenants table: each row IS a tenant
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_tenant_iso ON tenants;
CREATE POLICY tenants_tenant_iso ON tenants FOR ALL
  USING (id = current_tenant_id() OR is_super_admin())
  WITH CHECK (id = current_tenant_id() OR is_super_admin());

-- Users: a user is visible if they are a member of current_tenant_id
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_tenant_iso ON users;
CREATE POLICY users_tenant_iso ON users FOR ALL
  USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM tenant_members tm
      WHERE tm.user_id = users.id AND tm.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (is_super_admin());

-- tenant_members: rows belong to current tenant
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_members_tenant_iso ON tenant_members;
CREATE POLICY tenant_members_tenant_iso ON tenant_members FOR ALL
  USING (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- Sessions: row's user is a member of current_tenant
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_tenant_iso ON sessions;
CREATE POLICY sessions_tenant_iso ON sessions FOR ALL
  USING (
    is_super_admin() OR
    user_id = current_user_id() OR
    (tenant_id IS NOT NULL AND tenant_id = current_tenant_id())
  )
  WITH CHECK (user_id = current_user_id() OR is_super_admin());
`;

export const applyRls = async (db: Database): Promise<void> => {
  await db.execute(sql.raw(RLS_SQL));
};
