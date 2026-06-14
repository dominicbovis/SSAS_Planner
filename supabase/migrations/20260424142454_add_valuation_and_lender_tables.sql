/*
  # Add Valuation Model and Lender Pack Tables

  ## Summary
  Creates tables for the Valuation Model and Lender Pack pages.

  ## New Tables

  1. `valuation_settings`
     - Global valuation parameters: capitalisation rate, yield shifts, vacancy and cost allowances
     - One row per scheme (UNIQUE on scheme_id)

  2. `property_income_assumptions`
     - Per-property income inputs used in the valuation model
     - Links to property_register via property_id
     - Stores current rent, market rent, ERV, void assumption, capex allowance

  3. `lender_pack_settings`
     - All editable fields for the Lender Pack report
     - Executive summary, DSCR inputs, exit strategy, risk summary
     - Stores exit valuation scenario rows as JSONB
     - One row per scheme (UNIQUE on scheme_id)

  ## Security
  - RLS enabled on all tables
  - Public anon read/write (internal planning tool, no auth)
*/

-- Valuation Settings
CREATE TABLE IF NOT EXISTS valuation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  valuation_date date DEFAULT CURRENT_DATE,
  capitalisation_rate numeric(7,4) DEFAULT 6.0,
  yield_shift_down numeric(7,4) DEFAULT -0.5,
  yield_shift_up numeric(7,4) DEFAULT 0.5,
  vacancy_allowance_pct numeric(7,4) DEFAULT 5.0,
  non_recoverable_costs_pct numeric(7,4) DEFAULT 2.0,
  proposed_borrowing numeric(15,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(scheme_id)
);

ALTER TABLE valuation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read valuation settings"
  ON valuation_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert valuation settings"
  ON valuation_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public can update valuation settings"
  ON valuation_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Property Income Assumptions (per-property valuation inputs)
CREATE TABLE IF NOT EXISTS property_income_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES property_register(id) ON DELETE CASCADE,
  current_rent_pa numeric(15,2) DEFAULT 0,
  market_rent_pa numeric(15,2) DEFAULT 0,
  erv_rent_pa numeric(15,2) DEFAULT 0,
  void_assumption_months numeric(5,1) DEFAULT 0,
  capex_allowance_pa numeric(15,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id)
);

ALTER TABLE property_income_assumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read property income assumptions"
  ON property_income_assumptions FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert property income assumptions"
  ON property_income_assumptions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public can update property income assumptions"
  ON property_income_assumptions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete property income assumptions"
  ON property_income_assumptions FOR DELETE TO anon USING (true);

-- Lender Pack Settings
CREATE TABLE IF NOT EXISTS lender_pack_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  lender_pack_title text DEFAULT 'SSAS Lender Information Pack',
  report_date date DEFAULT CURRENT_DATE,
  prepared_by text DEFAULT '',
  purpose text DEFAULT 'For lender due diligence, refinance assessment, and covenant review.',
  executive_summary text DEFAULT '',
  annual_rental_income numeric(15,2) DEFAULT 0,
  annual_loan_interest_received numeric(15,2) DEFAULT 0,
  annual_borrowing_interest_paid numeric(15,2) DEFAULT 0,
  annual_property_expenses numeric(15,2) DEFAULT 0,
  annual_scheme_expenses numeric(15,2) DEFAULT 0,
  annual_loan_repayments_out numeric(15,2) DEFAULT 0,
  exit_strategy_description text DEFAULT '',
  exit_valuation_scenarios jsonb DEFAULT '[]'::jsonb,
  risk_summary text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(scheme_id)
);

ALTER TABLE lender_pack_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read lender pack settings"
  ON lender_pack_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert lender pack settings"
  ON lender_pack_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public can update lender pack settings"
  ON lender_pack_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);
