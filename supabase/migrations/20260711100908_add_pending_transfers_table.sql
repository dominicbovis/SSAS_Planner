/*
  # Add pending transfers table

  ## Summary
  Creates a new table to store pending transfer-ins (future transfers and pension payments)
  that are linked to a scenario. These represent expected incoming cash flows such as
  pension contributions, employer contributions, or other transfers that have been
  arranged but not yet received.

  ## New Tables
  1. `pending_transfers`
     - `id` (uuid, primary key)
     - `scenario_id` (uuid, FK to scenarios, cascade delete)
     - `scheme_id` (uuid, FK to ssas_schemes, cascade delete)
     - `description` (text) — short label for the transfer
     - `source` (text) — where the transfer is coming from (e.g. employer, HMRC, another scheme)
     - `amount` (numeric 15,2) — expected amount
     - `expected_date` (date) — when the transfer is expected to arrive
     - `created_at` (timestamptz)

  ## Security
  - RLS enabled on `pending_transfers`
  - Public CRUD access (TO anon, authenticated) matching existing single-tenant convention
*/

CREATE TABLE IF NOT EXISTS pending_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  amount numeric(15,2) NOT NULL DEFAULT 0,
  expected_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pending_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pending_transfers" ON pending_transfers;
CREATE POLICY "anon_select_pending_transfers"
  ON pending_transfers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_pending_transfers" ON pending_transfers;
CREATE POLICY "anon_insert_pending_transfers"
  ON pending_transfers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_pending_transfers" ON pending_transfers;
CREATE POLICY "anon_update_pending_transfers"
  ON pending_transfers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_pending_transfers" ON pending_transfers;
CREATE POLICY "anon_delete_pending_transfers"
  ON pending_transfers FOR DELETE
  TO anon, authenticated USING (true);
