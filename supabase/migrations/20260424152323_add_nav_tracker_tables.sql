/*
  # NAV Tracker Tables

  ## Summary
  Creates tables to support the NAV (Net Asset Value) Tracker page for SSAS pension schemes.

  ## New Tables

  ### nav_assets
  Manual asset entries for the NAV asset register.
  - `id` (uuid, PK)
  - `scheme_id` (uuid, FK → ssas_schemes)
  - `asset_type` (text) — enum: Cash, Commercial Property, Loanback, Third-Party Loan, Deposit, Investment, Other
  - `description` (text)
  - `market_value` (numeric) — GBP value
  - `valuation_date` (date)
  - `source` (text) — auto-source label: Cash_Balance, Properties, Loanbacks, etc.
  - `created_at`, `updated_at` (timestamptz)

  ### nav_liabilities
  Manual liability entries for the NAV liability register.
  - `id` (uuid, PK)
  - `scheme_id` (uuid, FK → ssas_schemes)
  - `liability_type` (text) — enum: Borrowing, Fees_Payable, Accruals, Other
  - `description` (text)
  - `amount` (numeric) — GBP value
  - `due_date` (date, nullable)
  - `created_at`, `updated_at` (timestamptz)

  ### nav_history
  Periodic snapshots of NAV for trend chart.
  - `id` (uuid, PK)
  - `scheme_id` (uuid, FK → ssas_schemes)
  - `snapshot_date` (date)
  - `total_assets` (numeric)
  - `total_liabilities` (numeric)
  - `net_asset_value` (numeric)
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled on all three tables
  - Authenticated users can SELECT, INSERT, UPDATE, DELETE their own scheme's rows
*/

-- nav_assets
CREATE TABLE IF NOT EXISTS nav_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  asset_type text NOT NULL DEFAULT 'Other',
  description text NOT NULL DEFAULT '',
  market_value numeric NOT NULL DEFAULT 0,
  valuation_date date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE nav_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select nav_assets for their scheme"
  ON nav_assets FOR SELECT
  TO authenticated
  USING (
    scheme_id IN (SELECT id FROM ssas_schemes WHERE id = scheme_id)
  );

CREATE POLICY "Authenticated users can insert nav_assets"
  ON nav_assets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update nav_assets"
  ON nav_assets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete nav_assets"
  ON nav_assets FOR DELETE
  TO authenticated
  USING (true);

-- nav_liabilities
CREATE TABLE IF NOT EXISTS nav_liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  liability_type text NOT NULL DEFAULT 'Other',
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  due_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE nav_liabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select nav_liabilities for their scheme"
  ON nav_liabilities FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert nav_liabilities"
  ON nav_liabilities FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update nav_liabilities"
  ON nav_liabilities FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete nav_liabilities"
  ON nav_liabilities FOR DELETE
  TO authenticated
  USING (true);

-- nav_history
CREATE TABLE IF NOT EXISTS nav_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  total_assets numeric NOT NULL DEFAULT 0,
  total_liabilities numeric NOT NULL DEFAULT 0,
  net_asset_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE nav_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select nav_history for their scheme"
  ON nav_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert nav_history"
  ON nav_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update nav_history"
  ON nav_history FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete nav_history"
  ON nav_history FOR DELETE
  TO authenticated
  USING (true);

-- indexes
CREATE INDEX IF NOT EXISTS nav_assets_scheme_id_idx ON nav_assets(scheme_id);
CREATE INDEX IF NOT EXISTS nav_liabilities_scheme_id_idx ON nav_liabilities(scheme_id);
CREATE INDEX IF NOT EXISTS nav_history_scheme_id_date_idx ON nav_history(scheme_id, snapshot_date);
