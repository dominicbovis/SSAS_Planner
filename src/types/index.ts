export interface DebtOverride {
  borrowing_id: string;
  lender_name: string;
  principal_outstanding: number;
  break_costs: number;
  fees_payable: number;
}

export interface SecurityRow {
  asset_type: string;
  asset_name: string;
  value: number;
  charge_rank: string;
  existing_charges: string;
  net_realisation_value: number;
}

export interface BridgingExitScenario {
  scenario_name: string;
  exit_valuation: number;
  exit_date: string;
  exit_method: string;
}

export interface RefinanceWaterfallSettings {
  id: string;
  scheme_id: string;
  refinance_date: string;
  refinance_valuation: number;
  target_ltv: number;
  new_loan_margin: number;
  new_loan_term_years: number;
  transaction_costs: number;
  projected_annual_noi: number;
  debt_overrides: DebtOverride[];
  created_at: string;
  updated_at: string;
}

export interface BridgingLenderPackSettings {
  id: string;
  scheme_id: string;
  title: string;
  report_date: string;
  prepared_by: string;
  bridging_loan_amount: number;
  bridging_loan_term_months: number;
  bridging_rate_pa: number;
  arrangement_fee_pct: number;
  exit_fee_pct: number;
  security_schedule: SecurityRow[];
  exit_scenarios: BridgingExitScenario[];
  created_at: string;
  updated_at: string;
}

export interface TermLenderPackSettings {
  id: string;
  scheme_id: string;
  title: string;
  report_date: string;
  prepared_by: string;
  requested_term_loan_amount: number;
  requested_term_years: number;
  proposed_margin: number;
  amortisation_profile: string;
  stabilised_rental_income: number;
  stabilised_loan_interest_received: number;
  stabilised_property_expenses: number;
  stabilised_scheme_expenses: number;
  annual_capital_repayment: number;
  noi_downside_pct: number;
  rate_up_pct: number;
  created_at: string;
  updated_at: string;
}

export interface ExitValuationScenario {
  scenario_name: string;
  valuation: number;
  ltv: number;
  borrowing_required: number;
  dscr_at_exit: number;
  surplus_or_deficit: number;
}

export interface ValuationSettings {
  id: string;
  scheme_id: string;
  valuation_date: string;
  capitalisation_rate: number;
  yield_shift_down: number;
  yield_shift_up: number;
  vacancy_allowance_pct: number;
  non_recoverable_costs_pct: number;
  proposed_borrowing: number;
  created_at: string;
  updated_at: string;
}

export interface PropertyIncomeAssumption {
  id: string;
  scheme_id: string;
  property_id: string;
  current_rent_pa: number;
  market_rent_pa: number;
  erv_rent_pa: number;
  void_assumption_months: number;
  capex_allowance_pa: number;
  created_at: string;
  updated_at: string;
}

export interface LenderPackSettings {
  id: string;
  scheme_id: string;
  lender_pack_title: string;
  report_date: string;
  prepared_by: string;
  purpose: string;
  executive_summary: string;
  annual_rental_income: number;
  annual_loan_interest_received: number;
  annual_borrowing_interest_paid: number;
  annual_property_expenses: number;
  annual_scheme_expenses: number;
  annual_loan_repayments_out: number;
  exit_strategy_description: string;
  exit_valuation_scenarios: ExitValuationScenario[];
  risk_summary: string;
  created_at: string;
  updated_at: string;
}

export interface SsasScheme {
  id: string;
  name: string;
  snapshot_date: string;
  net_asset_value: number;
  cash_balance: number;
  metro_bank_balance: number;
  cater_allen_balance: number;
  utb_balance: number;
  created_at: string;
  updated_at: string;
}

export interface PropertyRecord {
  id: string;
  scheme_id: string;
  property_name: string;
  address: string;
  purchase_date: string | null;
  purchase_price: number;
  current_value: number;
  annual_rent: number;
  tenant: string;
  lease_expiry: string | null;
  notes: string;
  created_at: string;
}

export interface LoanbackRecord {
  id: string;
  scheme_id: string;
  employer_name: string;
  loan_amount: number;
  interest_rate: number;
  loan_date: string | null;
  repayment_date: string | null;
  outstanding_balance: number;
  security: string;
  notes: string;
  created_at: string;
}

export interface ThirdPartyLoanRecord {
  id: string;
  scheme_id: string;
  borrower_name: string;
  loan_amount: number;
  interest_rate: number;
  loan_date: string | null;
  repayment_date: string | null;
  outstanding_balance: number;
  security: string;
  notes: string;
  created_at: string;
}

export interface BorrowingRecord {
  id: string;
  scheme_id: string;
  lender_name: string;
  loan_amount: number;
  interest_rate: number;
  loan_date: string | null;
  repayment_date: string | null;
  outstanding_balance: number;
  purpose: string;
  notes: string;
  created_at: string;
}

export interface EmployerInvestmentRecord {
  id: string;
  scheme_id: string;
  employer_name: string;
  investment_type: string;
  amount: number;
  investment_date: string | null;
  notes: string;
  created_at: string;
}

export type ScenarioActionType =
  | 'property_purchase'
  | 'loanback'
  | 'repay_loanback'
  | 'borrow'
  | 'repay_borrowing'
  | 'employer_investment'
  | 'cash_in'
  | 'cash_out';

export interface ScenarioAction {
  id: string;
  scenario_id: string;
  scheme_id: string;
  action_type: ScenarioActionType;
  label: string;
  counterparty: string;
  amount: number;
  notes: string;
  created_at: string;
}

export interface ScenarioRecord {
  id: string;
  scheme_id: string;
  scenario_name: string;
  description: string;
  nav_adjustment_pct: number;
  loanback_adjustment: number;
  borrowing_adjustment: number;
  employer_investment_adjustment: number;
  is_active: boolean;
  created_at: string;
}

export interface TrusteeReportSettings {
  id: string;
  scheme_id: string;
  report_title: string;
  report_date: string;
  prepared_by: string;
  period_covered: string;
  exec_summary_text: string;
  compliance_commentary: string;
  trustee_name: string;
  trustee_sign_off_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface MultiPeriodReportSettings {
  id: string;
  scheme_id: string;
  report_title: string;
  report_date: string;
  prepared_by: string;
  comparison_mode: 'Two Periods' | 'Three Periods';
  commentary: string;
  period_1_label: string;
  period_1_start_date: string | null;
  period_1_end_date: string | null;
  period_1_nav: number;
  period_1_loanbacks: number;
  period_1_borrowing: number;
  period_1_employer_investments: number;
  period_2_label: string;
  period_2_start_date: string | null;
  period_2_end_date: string | null;
  period_2_nav: number;
  period_2_loanbacks: number;
  period_2_borrowing: number;
  period_2_employer_investments: number;
  period_3_label: string;
  period_3_start_date: string | null;
  period_3_end_date: string | null;
  period_3_nav: number;
  period_3_loanbacks: number;
  period_3_borrowing: number;
  period_3_employer_investments: number;
  created_at: string;
  updated_at: string;
}

export interface TenYearProjectionSettings {
  id: string;
  scheme_id: string;
  projection_start_year: number;
  projection_years: number;
  annual_nav_growth_rate: number;
  annual_contribution: number;
  annual_benefit_outflow: number;
  target_loanback_pct: number;
  target_borrowing_pct: number;
  target_employer_investments_pct: number;
  commentary: string;
  created_at: string;
  updated_at: string;
}

export interface NavAsset {
  id: string;
  scheme_id: string;
  asset_type: 'Cash' | 'Commercial Property' | 'Loanback' | 'Third-Party Loan' | 'Deposit' | 'Investment' | 'Fund Investment' | 'Other';
  description: string;
  market_value: number;
  valuation_date: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface NavLiability {
  id: string;
  scheme_id: string;
  liability_type: 'Borrowing' | 'Fees_Payable' | 'Accruals' | 'Other';
  description: string;
  amount: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface NavHistoryRecord {
  id: string;
  scheme_id: string;
  snapshot_date: string;
  total_assets: number;
  total_liabilities: number;
  net_asset_value: number;
  created_at: string;
}

export interface CashflowSettings {
  id: string;
  scheme_id: string;
  forecast_start_date: string;
  forecast_horizon_months: number;
  opening_cash: number;
  include_scenario_adjustments: boolean;
  target_min_cash_buffer: number;
  monthly_employer_contributions: number;
  monthly_member_contributions: number;
  monthly_rental_income: number;
  monthly_loan_interest_received: number;
  monthly_other_income: number;
  monthly_loan_repayments_out: number;
  monthly_borrowing_interest_paid: number;
  monthly_property_expenses: number;
  monthly_scheme_expenses: number;
  monthly_benefit_payments: number;
  monthly_other_outflows: number;
  created_at: string;
  updated_at: string;
}

export interface FundInvestmentRecord {
  id: string;
  scheme_id: string;
  fund_name: string;
  fund_manager: string;
  fund_type: string;
  current_value: number;
  investment_date: string | null;
  notes: string;
  created_at: string;
}
