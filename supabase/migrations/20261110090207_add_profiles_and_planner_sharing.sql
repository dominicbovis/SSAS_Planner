/*
# Add user profiles, planner ownership, and planner sharing

## Summary
Moves the planner from a shared, public dataset to private, per-user planners.
Every signed-in person now sees only the planners they own or have been shared.
Anonymous visitors can no longer read or write any planner data.

## 1. New tables
- `profiles`: one row per person who can sign in.
  - `user_id` (uuid, primary key, links to the sign-in account)
  - `email` (text)
  - `is_admin` (boolean) - administrators can manage user accounts
  - `is_active` (boolean) - deactivated people cannot sign in
  - `must_set_password` (boolean) - drives the "set your password" screen after an invitation
  - `created_at` (timestamp)
- `planner_shares`: read-only access grants from a planner owner to another person.
  - `scheme_id`, `user_id`, `shared_by`, `created_at`
  - Unique per planner and person.

## 2. Modified tables
- `ssas_schemes` gains `owner_id`, the person who owns the planner.
  - Existing planners get their owner assigned separately after this migration.

## 3. New helper functions
- `current_user_is_admin()` - true for active administrators.
- `is_planner_owner(scheme)` - true when the signed-in person owns that planner.
- `has_planner_access(scheme)` - true when the person owns or was shared that planner.
- Helpers run with elevated rights only to read the ownership tables, and can be called by signed-in users only.

## 4. Security changes
- Row level security stays enabled on every planner table.
- Anonymous access is removed from every planner table, including chat history.
- Planner data (registers, scenarios, reports, settings, NAV tracker, transfers):
  - Anyone with access can read.
  - Only the owner can insert, update, or delete.
- Chat sessions and messages: anyone with access to a planner can read, start, and continue chats.
- Planner details (name, figures, balances) can be updated by the owner only. Ownership cannot be changed by users.
- Profiles: people can read their own profile, administrators can read all profiles, and people can only change their own "must set password" flag.
- Planner shares: owners and viewers can see a share, and owners can remove shares. Creating shares happens through a secure server function.

## Important notes
1. Writes to profiles, planner shares, and new planners happen only through server functions that check the caller's identity and permissions.
2. Every table keeps row level security enabled. Each table has separate select, insert, update, and delete rules.
*/

CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  must_set_password boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON profiles FROM anon, authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (must_set_password) ON profiles TO authenticated;
GRANT ALL ON profiles TO service_role;

ALTER TABLE ssas_schemes ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ssas_schemes_owner_id_idx ON ssas_schemes(owner_id);

CREATE TABLE IF NOT EXISTS planner_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, user_id)
);

CREATE INDEX IF NOT EXISTS planner_shares_user_id_idx ON planner_shares(user_id);

ALTER TABLE planner_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planner_shares FROM anon, authenticated;
GRANT SELECT, DELETE ON planner_shares TO authenticated;
GRANT ALL ON planner_shares TO service_role;

CREATE OR REPLACE FUNCTION current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid() AND is_admin AND is_active
  );
$$;

CREATE OR REPLACE FUNCTION is_planner_owner(p_scheme_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ssas_schemes
    WHERE id = p_scheme_id AND owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION has_planner_access(p_scheme_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_planner_owner(p_scheme_id)
    OR EXISTS (
      SELECT 1 FROM planner_shares
      WHERE scheme_id = p_scheme_id AND user_id = auth.uid()
    );
$$;

REVOKE EXECUTE ON FUNCTION current_user_is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_planner_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION has_planner_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_planner_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION has_planner_access(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users read own profile" ON profiles;
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all profiles" ON profiles;
CREATE POLICY "Admins read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (current_user_is_admin());

DROP POLICY IF EXISTS "Users update own password flag" ON profiles;
CREATE POLICY "Users update own password flag"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners and viewers read shares" ON planner_shares;
CREATE POLICY "Owners and viewers read shares"
  ON planner_shares FOR SELECT
  TO authenticated
  USING (is_planner_owner(scheme_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Owners remove shares" ON planner_shares;
CREATE POLICY "Owners remove shares"
  ON planner_shares FOR DELETE
  TO authenticated
  USING (is_planner_owner(scheme_id));

REVOKE ALL ON ssas_schemes FROM anon, authenticated;
GRANT SELECT ON ssas_schemes TO authenticated;
GRANT UPDATE (name, snapshot_date, net_asset_value, cash_balance, metro_bank_balance, cater_allen_balance, utb_balance, updated_at)
  ON ssas_schemes TO authenticated;

DROP POLICY IF EXISTS "Public can read schemes" ON ssas_schemes;
DROP POLICY IF EXISTS "Public can insert schemes" ON ssas_schemes;
DROP POLICY IF EXISTS "Public can update schemes" ON ssas_schemes;

DROP POLICY IF EXISTS "Members read planners" ON ssas_schemes;
CREATE POLICY "Members read planners"
  ON ssas_schemes FOR SELECT
  TO authenticated
  USING (has_planner_access(id));

DROP POLICY IF EXISTS "Owners update planner" ON ssas_schemes;
CREATE POLICY "Owners update planner"
  ON ssas_schemes FOR UPDATE
  TO authenticated
  USING (is_planner_owner(id))
  WITH CHECK (is_planner_owner(id));

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'borrowing_register', 'bridging_lender_pack_settings', 'cashflow_settings',
    'employer_related_investments', 'fund_investments', 'lender_pack_settings',
    'loanback_register', 'multi_period_report_settings', 'nav_assets', 'nav_history',
    'nav_liabilities', 'pending_transfers', 'property_income_assumptions',
    'property_register', 'refinance_waterfall_settings', 'scenario_actions',
    'scenarios', 'ten_year_projection_settings', 'term_lender_pack_settings',
    'third_party_loans', 'trustee_report_settings', 'valuation_settings'
  ] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;

    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);

    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (has_planner_access(scheme_id))', t || '_select_members', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (is_planner_owner(scheme_id))', t || '_insert_owner', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (is_planner_owner(scheme_id)) WITH CHECK (is_planner_owner(scheme_id))', t || '_update_owner', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (is_planner_owner(scheme_id))', t || '_delete_owner', t);
  END LOOP;
END $$;

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_sessions', 'chat_messages'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;

    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "chat_sessions_select_members" ON chat_sessions;
CREATE POLICY "chat_sessions_select_members" ON chat_sessions FOR SELECT TO authenticated
  USING (has_planner_access(scheme_id));

DROP POLICY IF EXISTS "chat_sessions_insert_members" ON chat_sessions;
CREATE POLICY "chat_sessions_insert_members" ON chat_sessions FOR INSERT TO authenticated
  WITH CHECK (has_planner_access(scheme_id));

DROP POLICY IF EXISTS "chat_sessions_update_members" ON chat_sessions;
CREATE POLICY "chat_sessions_update_members" ON chat_sessions FOR UPDATE TO authenticated
  USING (has_planner_access(scheme_id)) WITH CHECK (has_planner_access(scheme_id));

DROP POLICY IF EXISTS "chat_sessions_delete_members" ON chat_sessions;
CREATE POLICY "chat_sessions_delete_members" ON chat_sessions FOR DELETE TO authenticated
  USING (has_planner_access(scheme_id));

DROP POLICY IF EXISTS "chat_messages_select_members" ON chat_messages;
CREATE POLICY "chat_messages_select_members" ON chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_sessions s WHERE s.id = chat_messages.session_id));

DROP POLICY IF EXISTS "chat_messages_insert_members" ON chat_messages;
CREATE POLICY "chat_messages_insert_members" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM chat_sessions s WHERE s.id = chat_messages.session_id));

DROP POLICY IF EXISTS "chat_messages_update_members" ON chat_messages;
CREATE POLICY "chat_messages_update_members" ON chat_messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_sessions s WHERE s.id = chat_messages.session_id))
  WITH CHECK (EXISTS (SELECT 1 FROM chat_sessions s WHERE s.id = chat_messages.session_id));

DROP POLICY IF EXISTS "chat_messages_delete_members" ON chat_messages;
CREATE POLICY "chat_messages_delete_members" ON chat_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_sessions s WHERE s.id = chat_messages.session_id));
