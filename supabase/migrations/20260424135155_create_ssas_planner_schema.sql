/*
  # SSAS Utilisation Planner - Complete Schema

  ## Summary
  Creates all tables required for the SSAS Utilisation Planner application, including:
  scheme management, property register, loanback register, third-party loans,
  borrowing register, employer-related investments, scenarios, and cashflow settings.

  ## New Tables

  1. `ssas_schemes` - Core SSAS scheme data (NAV, cash balance, snapshot date)
  2. `property_register` - Commercial property holdings
  3. `loanback_register` - Employer loanback loans
  4. `third_party_loans` - Third-party loan records
  5. `borrowing_register` - Scheme borrowing records
  6. `employer_related_investments` - Employer-related investment holdings
  7. `scenarios` - Scenario planning records
  8. `cashflow_settings` - Cashflow forecast configuration per scheme

  ## Security
  - RLS enabled on all tables
  - Public read/write access (no auth required per spec - single-user tool)
  - Policies allow all operations for anon role (internal planning tool)

  ## Notes
  - All currency fields use NUMERIC(15,2) for precision
  - Foreign keys link all registers to the parent ssas_schemes table
  - A single default scheme is inserted on first load via the application
*/

-- SSAS Schemes (master record)
CREATE TABLE IF NOT EXISTS ssas_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My SSAS',
  snapshot_date date DEFAULT CURRENT_DATE,
  net_asset_value numeric(15,2) DEFAULT 0,
  cash_balance numeric(15,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ssas_schemes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read schemes"
  ON ssas_schemes FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Public can insert schemes"
  ON ssas_schemes FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Public can update schemes"
  ON ssas_schemes FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Property Register
CREATE TABLE IF NOT EXISTS property_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  property_name text NOT NULL DEFAULT '',
  address text DEFAULT '',
  purchase_date date,
  purchase_price numeric(15,2) DEFAULT 0,
  current_value numeric(15,2) DEFAULT 0,
  annual_rent numeric(15,2) DEFAULT 0,
  tenant text DEFAULT '',
  lease_expiry date,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE property_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read properties"
  ON property_register FOR SELECT TO anon USING (true);

CREATE POLICY "Public can insert properties"
  ON property_register FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public can update properties"
  ON property_register FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete properties"
  ON property_register FOR DELETE TO anon USING (true);

-- Loanback Register
CREATE TABLE IF NOT EXISTS loanback_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  employer_name text NOT NULL DEFAULT '',
  loan_amount numeric(15,2) DEFAULT 0,
  interest_rate numeric(5,2) DEFAULT 0,
  loan_date date,
  repayment_date date,
  outstanding_balance numeric(15,2) DEFAULT 0,
  security text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE loanback_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read loanbacks"
  ON loanback_register FOR SELECT TO anon USING (true);

CREATE POLICY "Public can insert loanbacks"
  ON loanback_register FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public can update loanbacks"
  ON loanback_register FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete loanbacks"
  ON loanback_register FOR DELETE TO anon USING (true);

-- Third-Party Loans
CREATE TABLE IF NOT EXISTS third_party_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  borrower_name text NOT NULL DEFAULT '',
  loan_amount numeric(15,2) DEFAULT 0,
  interest_rate numeric(5,2) DEFAULT 0,
  loan_date date,
  repayment_date date,
  outstanding_balance numeric(15,2) DEFAULT 0,
  security text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE third_party_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read third party loans"
  ON third_party_loans FOR SELECT TO anon USING (true);

CREATE POLICY "Public can insert third party loans"
  ON third_party_loans FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public can update third party loans"
  ON third_party_loans FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete third party loans"
  ON third_party_loans FOR DELETE TO anon USING (true);

-- Borrowing Register
CREATE TABLE IF NOT EXISTS borrowing_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  lender_name text NOT NULL DEFAULT '',
  loan_amount numeric(15,2) DEFAULT 0,
  interest_rate numeric(5,2) DEFAULT 0,
  loan_date date,
  repayment_date date,
  outstanding_balance numeric(15,2) DEFAULT 0,
  purpose text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE borrowing_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read borrowing"
  ON borrowing_register FOR SELECT TO anon USING (true);

CREATE POLICY "Public can insert borrowing"
  ON borrowing_register FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public can update borrowing"
  ON borrowing_register FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete borrowing"
  ON borrowing_register FOR DELETE TO anon USING (true);

-- Employer-Related Investments
CREATE TABLE IF NOT EXISTS employer_related_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  employer_name text NOT NULL DEFAULT '',
  investment_type text DEFAULT '',
  amount numeric(15,2) DEFAULT 0,
  investment_date date,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE employer_related_investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read employer investments"
  ON employer_related_investments FOR SELECT TO anon USING (true);

CREATE POLICY "Public can insert employer investments"
  ON employer_related_investments FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public can update employer investments"
  ON employer_related_investments FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete employer investments"
  ON employer_related_investments FOR DELETE TO anon USING (true);

-- Scenarios
CREATE TABLE IF NOT EXISTS scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  scenario_name text NOT NULL DEFAULT 'Scenario 1',
  nav_adjustment_pct numeric(8,4) DEFAULT 0,
  loanback_adjustment numeric(15,2) DEFAULT 0,
  borrowing_adjustment numeric(15,2) DEFAULT 0,
  employer_investment_adjustment numeric(15,2) DEFAULT 0,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read scenarios"
  ON scenarios FOR SELECT TO anon USING (true);

CREATE POLICY "Public can insert scenarios"
  ON scenarios FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public can update scenarios"
  ON scenarios FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete scenarios"
  ON scenarios FOR DELETE TO anon USING (true);

-- Cashflow Settings
CREATE TABLE IF NOT EXISTS cashflow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  forecast_start_date date DEFAULT CURRENT_DATE,
  forecast_horizon_months integer DEFAULT 12,
  opening_cash numeric(15,2) DEFAULT 0,
  include_scenario_adjustments boolean DEFAULT false,
  target_min_cash_buffer numeric(15,2) DEFAULT 0,
  monthly_employer_contributions numeric(15,2) DEFAULT 0,
  monthly_member_contributions numeric(15,2) DEFAULT 0,
  monthly_rental_income numeric(15,2) DEFAULT 0,
  monthly_loan_interest_received numeric(15,2) DEFAULT 0,
  monthly_other_income numeric(15,2) DEFAULT 0,
  monthly_loan_repayments_out numeric(15,2) DEFAULT 0,
  monthly_borrowing_interest_paid numeric(15,2) DEFAULT 0,
  monthly_property_expenses numeric(15,2) DEFAULT 0,
  monthly_scheme_expenses numeric(15,2) DEFAULT 0,
  monthly_benefit_payments numeric(15,2) DEFAULT 0,
  monthly_other_outflows numeric(15,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(scheme_id)
);

ALTER TABLE cashflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read cashflow settings"
  ON cashflow_settings FOR SELECT TO anon USING (true);

CREATE POLICY "Public can insert cashflow settings"
  ON cashflow_settings FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public can update cashflow settings"
  ON cashflow_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Insert a default scheme
INSERT INTO ssas_schemes (name, snapshot_date, net_asset_value, cash_balance)
VALUES ('Red Horizons SSAS', CURRENT_DATE, 1000000, 150000)
ON CONFLICT DO NOTHING;
