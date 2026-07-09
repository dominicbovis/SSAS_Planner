/*
# Tighten RLS write policies — scope all writes to valid scheme IDs

## Summary
All INSERT/UPDATE/DELETE policies previously used `USING (true)` / `WITH CHECK (true)`,
which allows any anonymous caller to write arbitrary rows regardless of whether the
target scheme_id belongs to a real scheme. This migration replaces those open predicates
with `scheme_id IN (SELECT id FROM ssas_schemes)`, which:
- Prevents inserting rows that reference non-existent schemes
- Prevents modifying or deleting rows outside valid schemes
- Stops cross-scheme writes if multiple schemes are ever present

READ policies (SELECT) are left as `USING (true)` — correct for a single-tenant no-auth
app where all data is intentionally shared.

## Tables modified
All child tables that carry a scheme_id column:
borrowing_register, employer_related_investments, fund_investments, loanback_register,
property_register, third_party_loans, scenarios, scenario_actions, cashflow_settings,
trustee_report_settings, multi_period_report_settings, ten_year_projection_settings,
valuation_settings, lender_pack_settings, refinance_waterfall_settings,
bridging_lender_pack_settings, term_lender_pack_settings, property_income_assumptions,
nav_assets, nav_liabilities, nav_history

## Not changed
ssas_schemes INSERT/UPDATE — root table, no parent to scope against.
All SELECT policies — `USING (true)` is correct for a no-auth single-tenant app.
*/

-- ── borrowing_register ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert borrowing" ON borrowing_register;
DROP POLICY IF EXISTS "Public can update borrowing" ON borrowing_register;
DROP POLICY IF EXISTS "Public can delete borrowing" ON borrowing_register;

CREATE POLICY "Public can insert borrowing"
  ON borrowing_register FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update borrowing"
  ON borrowing_register FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can delete borrowing"
  ON borrowing_register FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── employer_related_investments ────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert employer investments" ON employer_related_investments;
DROP POLICY IF EXISTS "Public can update employer investments" ON employer_related_investments;
DROP POLICY IF EXISTS "Public can delete employer investments" ON employer_related_investments;

CREATE POLICY "Public can insert employer investments"
  ON employer_related_investments FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update employer investments"
  ON employer_related_investments FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can delete employer investments"
  ON employer_related_investments FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── fund_investments ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert fund investments" ON fund_investments;
DROP POLICY IF EXISTS "Public can update fund investments" ON fund_investments;
DROP POLICY IF EXISTS "Public can delete fund investments" ON fund_investments;

CREATE POLICY "Public can insert fund investments"
  ON fund_investments FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update fund investments"
  ON fund_investments FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can delete fund investments"
  ON fund_investments FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── loanback_register ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert loanbacks" ON loanback_register;
DROP POLICY IF EXISTS "Public can update loanbacks" ON loanback_register;
DROP POLICY IF EXISTS "Public can delete loanbacks" ON loanback_register;

CREATE POLICY "Public can insert loanbacks"
  ON loanback_register FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update loanbacks"
  ON loanback_register FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can delete loanbacks"
  ON loanback_register FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── property_register ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert properties" ON property_register;
DROP POLICY IF EXISTS "Public can update properties" ON property_register;
DROP POLICY IF EXISTS "Public can delete properties" ON property_register;

CREATE POLICY "Public can insert properties"
  ON property_register FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update properties"
  ON property_register FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can delete properties"
  ON property_register FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── third_party_loans ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert third party loans" ON third_party_loans;
DROP POLICY IF EXISTS "Public can update third party loans" ON third_party_loans;
DROP POLICY IF EXISTS "Public can delete third party loans" ON third_party_loans;

CREATE POLICY "Public can insert third party loans"
  ON third_party_loans FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update third party loans"
  ON third_party_loans FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can delete third party loans"
  ON third_party_loans FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── scenarios ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert scenarios" ON scenarios;
DROP POLICY IF EXISTS "Public can update scenarios" ON scenarios;
DROP POLICY IF EXISTS "Public can delete scenarios" ON scenarios;

CREATE POLICY "Public can insert scenarios"
  ON scenarios FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update scenarios"
  ON scenarios FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can delete scenarios"
  ON scenarios FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── scenario_actions ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert scenario_actions" ON scenario_actions;
DROP POLICY IF EXISTS "Public can update scenario_actions" ON scenario_actions;
DROP POLICY IF EXISTS "Public can delete scenario_actions" ON scenario_actions;

CREATE POLICY "Public can insert scenario_actions"
  ON scenario_actions FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update scenario_actions"
  ON scenario_actions FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can delete scenario_actions"
  ON scenario_actions FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── cashflow_settings ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert cashflow settings" ON cashflow_settings;
DROP POLICY IF EXISTS "Public can update cashflow settings" ON cashflow_settings;

CREATE POLICY "Public can insert cashflow settings"
  ON cashflow_settings FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update cashflow settings"
  ON cashflow_settings FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── trustee_report_settings ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert trustee report settings" ON trustee_report_settings;
DROP POLICY IF EXISTS "Public can update trustee report settings" ON trustee_report_settings;

CREATE POLICY "Public can insert trustee report settings"
  ON trustee_report_settings FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update trustee report settings"
  ON trustee_report_settings FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── multi_period_report_settings ────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert multi period report settings" ON multi_period_report_settings;
DROP POLICY IF EXISTS "Public can update multi period report settings" ON multi_period_report_settings;

CREATE POLICY "Public can insert multi period report settings"
  ON multi_period_report_settings FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update multi period report settings"
  ON multi_period_report_settings FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── ten_year_projection_settings ────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert ten year projection settings" ON ten_year_projection_settings;
DROP POLICY IF EXISTS "Public can update ten year projection settings" ON ten_year_projection_settings;

CREATE POLICY "Public can insert ten year projection settings"
  ON ten_year_projection_settings FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update ten year projection settings"
  ON ten_year_projection_settings FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── valuation_settings ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert valuation settings" ON valuation_settings;
DROP POLICY IF EXISTS "Public can update valuation settings" ON valuation_settings;

CREATE POLICY "Public can insert valuation settings"
  ON valuation_settings FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update valuation settings"
  ON valuation_settings FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── lender_pack_settings ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert lender pack settings" ON lender_pack_settings;
DROP POLICY IF EXISTS "Public can update lender pack settings" ON lender_pack_settings;

CREATE POLICY "Public can insert lender pack settings"
  ON lender_pack_settings FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update lender pack settings"
  ON lender_pack_settings FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── refinance_waterfall_settings ────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert refinance waterfall settings" ON refinance_waterfall_settings;
DROP POLICY IF EXISTS "Public can update refinance waterfall settings" ON refinance_waterfall_settings;

CREATE POLICY "Public can insert refinance waterfall settings"
  ON refinance_waterfall_settings FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update refinance waterfall settings"
  ON refinance_waterfall_settings FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── bridging_lender_pack_settings ───────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert bridging lender pack settings" ON bridging_lender_pack_settings;
DROP POLICY IF EXISTS "Public can update bridging lender pack settings" ON bridging_lender_pack_settings;

CREATE POLICY "Public can insert bridging lender pack settings"
  ON bridging_lender_pack_settings FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update bridging lender pack settings"
  ON bridging_lender_pack_settings FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── term_lender_pack_settings ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert term lender pack settings" ON term_lender_pack_settings;
DROP POLICY IF EXISTS "Public can update term lender pack settings" ON term_lender_pack_settings;

CREATE POLICY "Public can insert term lender pack settings"
  ON term_lender_pack_settings FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update term lender pack settings"
  ON term_lender_pack_settings FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── property_income_assumptions ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert property income assumptions" ON property_income_assumptions;
DROP POLICY IF EXISTS "Public can update property income assumptions" ON property_income_assumptions;
DROP POLICY IF EXISTS "Public can delete property income assumptions" ON property_income_assumptions;

CREATE POLICY "Public can insert property income assumptions"
  ON property_income_assumptions FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can update property income assumptions"
  ON property_income_assumptions FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Public can delete property income assumptions"
  ON property_income_assumptions FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── nav_assets ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert nav_assets" ON nav_assets;
DROP POLICY IF EXISTS "Authenticated users can update nav_assets" ON nav_assets;
DROP POLICY IF EXISTS "Authenticated users can delete nav_assets" ON nav_assets;

CREATE POLICY "Authenticated users can insert nav_assets"
  ON nav_assets FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Authenticated users can update nav_assets"
  ON nav_assets FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Authenticated users can delete nav_assets"
  ON nav_assets FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── nav_liabilities ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert nav_liabilities" ON nav_liabilities;
DROP POLICY IF EXISTS "Authenticated users can update nav_liabilities" ON nav_liabilities;
DROP POLICY IF EXISTS "Authenticated users can delete nav_liabilities" ON nav_liabilities;

CREATE POLICY "Authenticated users can insert nav_liabilities"
  ON nav_liabilities FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Authenticated users can update nav_liabilities"
  ON nav_liabilities FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Authenticated users can delete nav_liabilities"
  ON nav_liabilities FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));

-- ── nav_history ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert nav_history" ON nav_history;
DROP POLICY IF EXISTS "Authenticated users can update nav_history" ON nav_history;
DROP POLICY IF EXISTS "Authenticated users can delete nav_history" ON nav_history;

CREATE POLICY "Authenticated users can insert nav_history"
  ON nav_history FOR INSERT TO anon, authenticated
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Authenticated users can update nav_history"
  ON nav_history FOR UPDATE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes))
  WITH CHECK (scheme_id IN (SELECT id FROM ssas_schemes));

CREATE POLICY "Authenticated users can delete nav_history"
  ON nav_history FOR DELETE TO anon, authenticated
  USING (scheme_id IN (SELECT id FROM ssas_schemes));
