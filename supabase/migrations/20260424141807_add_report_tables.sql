/*
  # Add Report Tables

  ## Summary
  Adds three new tables to support the reporting pages:
  trustee report (single period), multi-period comparison report,
  and 10-year projection settings.

  ## New Tables

  1. `trustee_report_settings`
     - Stores all editable fields for the single-period Trustee Report
     - Executive summary, compliance commentary, sign-off fields
     - One row per scheme (UNIQUE on scheme_id)

  2. `multi_period_report_settings`
     - Stores header info plus manually-entered period snapshots (P1, P2, P3)
     - Each period has: label, start/end dates, NAV, loanbacks, borrowing, employer investments
     - comparison_mode determines whether 2 or 3 periods are shown
     - One row per scheme (UNIQUE on scheme_id)

  3. `ten_year_projection_settings`
     - Stores inputs for the 10-year NAV and HMRC headroom projection
     - Growth rate, contributions, benefit outflows, target utilisation percentages
     - Free-text commentary field
     - One row per scheme (UNIQUE on scheme_id)

  ## Security
  - RLS enabled on all tables
  - Public anon read/write (internal planning tool, no auth)
*/

-- Trustee Report Settings (single period)
CREATE TABLE IF NOT EXISTS trustee_report_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  report_title text DEFAULT 'SSAS Trustee Utilisation & Compliance Report',
  report_date date DEFAULT CURRENT_DATE,
  prepared_by text DEFAULT '',
  period_covered text DEFAULT '',
  exec_summary_text text DEFAULT 'During the period, the scheme maintained utilisation within HMRC limits for loanbacks, borrowing and employer-related investments. Key utilisation metrics, capacity headroom and projected liquidity are summarised below.',
  compliance_commentary text DEFAULT '',
  trustee_name text DEFAULT '',
  trustee_sign_off_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(scheme_id)
);

ALTER TABLE trustee_report_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read trustee report settings"
  ON trustee_report_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert trustee report settings"
  ON trustee_report_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public can update trustee report settings"
  ON trustee_report_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Multi-Period Report Settings
CREATE TABLE IF NOT EXISTS multi_period_report_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  report_title text DEFAULT 'SSAS Trustee Multi-Period Utilisation Report',
  report_date date DEFAULT CURRENT_DATE,
  prepared_by text DEFAULT '',
  comparison_mode text DEFAULT 'Two Periods',
  commentary text DEFAULT '',
  period_1_label text DEFAULT 'Current Year',
  period_1_start_date date,
  period_1_end_date date,
  period_1_nav numeric(15,2) DEFAULT 0,
  period_1_loanbacks numeric(15,2) DEFAULT 0,
  period_1_borrowing numeric(15,2) DEFAULT 0,
  period_1_employer_investments numeric(15,2) DEFAULT 0,
  period_2_label text DEFAULT 'Prior Year',
  period_2_start_date date,
  period_2_end_date date,
  period_2_nav numeric(15,2) DEFAULT 0,
  period_2_loanbacks numeric(15,2) DEFAULT 0,
  period_2_borrowing numeric(15,2) DEFAULT 0,
  period_2_employer_investments numeric(15,2) DEFAULT 0,
  period_3_label text DEFAULT 'Baseline',
  period_3_start_date date,
  period_3_end_date date,
  period_3_nav numeric(15,2) DEFAULT 0,
  period_3_loanbacks numeric(15,2) DEFAULT 0,
  period_3_borrowing numeric(15,2) DEFAULT 0,
  period_3_employer_investments numeric(15,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(scheme_id)
);

ALTER TABLE multi_period_report_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read multi period report settings"
  ON multi_period_report_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert multi period report settings"
  ON multi_period_report_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public can update multi period report settings"
  ON multi_period_report_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 10-Year Projection Settings
CREATE TABLE IF NOT EXISTS ten_year_projection_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  projection_start_year integer DEFAULT 2026,
  projection_years integer DEFAULT 10,
  annual_nav_growth_rate numeric(7,4) DEFAULT 5,
  annual_contribution numeric(15,2) DEFAULT 0,
  annual_benefit_outflow numeric(15,2) DEFAULT 0,
  target_loanback_pct numeric(7,4) DEFAULT 30,
  target_borrowing_pct numeric(7,4) DEFAULT 20,
  target_employer_investments_pct numeric(7,4) DEFAULT 10,
  commentary text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(scheme_id)
);

ALTER TABLE ten_year_projection_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read ten year projection settings"
  ON ten_year_projection_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert ten year projection settings"
  ON ten_year_projection_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public can update ten year projection settings"
  ON ten_year_projection_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);
