CREATE TABLE IF NOT EXISTS fund_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  fund_name text NOT NULL DEFAULT '',
  fund_manager text NOT NULL DEFAULT '',
  fund_type text NOT NULL DEFAULT '',
  current_value numeric NOT NULL DEFAULT 0,
  investment_date date,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fund_investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_fund_investments"
  ON fund_investments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "insert_fund_investments"
  ON fund_investments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "update_fund_investments"
  ON fund_investments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "delete_fund_investments"
  ON fund_investments FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS fund_investments_scheme_id_idx ON fund_investments(scheme_id);
