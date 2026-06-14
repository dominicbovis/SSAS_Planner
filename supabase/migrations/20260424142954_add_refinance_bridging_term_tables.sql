/*
  # Add Refinance Waterfall, Bridging Lender Pack, and Term Lender Pack Tables

  ## Summary
  Three new tables supporting the Refinance Waterfall page and the two specialist
  lender pack pages (Bridging and Term).

  ## New Tables

  1. `refinance_waterfall_settings`
     - Stores refinance date, valuation, target LTV, loan margin, term, and transaction costs
     - Per-borrowing row overrides (break costs / fees) stored as JSONB
     - projected_annual_noi for DSCR calculation
     - One row per scheme (UNIQUE on scheme_id)

  2. `bridging_lender_pack_settings`
     - Header fields, bridging loan terms (amount, term months, rate, fees)
     - Security schedule rows stored as JSONB array
     - Exit route scenario rows stored as JSONB array
     - One row per scheme (UNIQUE on scheme_id)

  3. `term_lender_pack_settings`
     - Header fields, loan request summary
     - Income & DSCR inputs (stabilised NOI components)
     - DSCR sensitivity inputs
     - One row per scheme (UNIQUE on scheme_id)

  ## Security
  - RLS enabled on all tables
  - Public anon read/write (internal planning tool, no auth)
*/

-- Refinance Waterfall Settings
CREATE TABLE IF NOT EXISTS refinance_waterfall_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  refinance_date date DEFAULT CURRENT_DATE,
  refinance_valuation numeric(15,2) DEFAULT 0,
  target_ltv numeric(7,4) DEFAULT 65,
  new_loan_margin numeric(7,4) DEFAULT 5,
  new_loan_term_years integer DEFAULT 5,
  transaction_costs numeric(15,2) DEFAULT 0,
  projected_annual_noi numeric(15,2) DEFAULT 0,
  debt_overrides jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(scheme_id)
);

ALTER TABLE refinance_waterfall_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read refinance waterfall settings"
  ON refinance_waterfall_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert refinance waterfall settings"
  ON refinance_waterfall_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public can update refinance waterfall settings"
  ON refinance_waterfall_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Bridging Lender Pack Settings
CREATE TABLE IF NOT EXISTS bridging_lender_pack_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  title text DEFAULT 'SSAS Bridging Lender Pack',
  report_date date DEFAULT CURRENT_DATE,
  prepared_by text DEFAULT '',
  bridging_loan_amount numeric(15,2) DEFAULT 0,
  bridging_loan_term_months integer DEFAULT 12,
  bridging_rate_pa numeric(7,4) DEFAULT 8,
  arrangement_fee_pct numeric(7,4) DEFAULT 2,
  exit_fee_pct numeric(7,4) DEFAULT 1,
  security_schedule jsonb DEFAULT '[]'::jsonb,
  exit_scenarios jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(scheme_id)
);

ALTER TABLE bridging_lender_pack_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read bridging lender pack settings"
  ON bridging_lender_pack_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert bridging lender pack settings"
  ON bridging_lender_pack_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public can update bridging lender pack settings"
  ON bridging_lender_pack_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Term Lender Pack Settings
CREATE TABLE IF NOT EXISTS term_lender_pack_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  title text DEFAULT 'SSAS Term Lender Pack',
  report_date date DEFAULT CURRENT_DATE,
  prepared_by text DEFAULT '',
  requested_term_loan_amount numeric(15,2) DEFAULT 0,
  requested_term_years integer DEFAULT 5,
  proposed_margin numeric(7,4) DEFAULT 5,
  amortisation_profile text DEFAULT 'Interest-only',
  stabilised_rental_income numeric(15,2) DEFAULT 0,
  stabilised_loan_interest_received numeric(15,2) DEFAULT 0,
  stabilised_property_expenses numeric(15,2) DEFAULT 0,
  stabilised_scheme_expenses numeric(15,2) DEFAULT 0,
  annual_capital_repayment numeric(15,2) DEFAULT 0,
  noi_downside_pct numeric(7,4) DEFAULT -10,
  rate_up_pct numeric(7,4) DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(scheme_id)
);

ALTER TABLE term_lender_pack_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read term lender pack settings"
  ON term_lender_pack_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert term lender pack settings"
  ON term_lender_pack_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public can update term lender pack settings"
  ON term_lender_pack_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);
