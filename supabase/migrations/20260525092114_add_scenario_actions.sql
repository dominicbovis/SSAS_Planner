/*
  # Add scenario_actions table

  1. New Tables
    - `scenario_actions`
      - `id` (uuid, primary key)
      - `scenario_id` (uuid, FK to scenarios, cascade delete)
      - `scheme_id` (uuid, FK to ssas_schemes, cascade delete)
      - `action_type` (text) — one of: property_purchase, loanback, repay_loanback, borrow,
          repay_borrowing, employer_investment, cash_in, cash_out
      - `label` (text) — short human description e.g. "Purchase building from RHHL"
      - `counterparty` (text) — optional counterparty name
      - `amount` (numeric 15,2) — positive value; direction is determined by action_type
      - `notes` (text) — optional additional notes
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS with public access policies matching existing table conventions
*/

CREATE TABLE IF NOT EXISTS scenario_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  label text NOT NULL DEFAULT '',
  counterparty text NOT NULL DEFAULT '',
  amount numeric(15,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scenario_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read scenario_actions"
  ON scenario_actions FOR SELECT USING (true);

CREATE POLICY "Public can insert scenario_actions"
  ON scenario_actions FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can update scenario_actions"
  ON scenario_actions FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete scenario_actions"
  ON scenario_actions FOR DELETE USING (true);
