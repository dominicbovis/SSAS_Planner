import { useEffect, useState, useCallback } from 'react';
import { Printer, Save, Plus, Trash2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  SsasScheme, LenderPackSettings, ExitValuationScenario, CashflowSettings,
} from '../types';
import GaugeChart from '../components/GaugeChart';
import BarChart from '../components/BarChart';
import LineChart from '../components/LineChart';
import StatusBadge from '../components/StatusBadge';

import CurrencyInput from '../components/CurrencyInput';
import { fmt, fmtFull } from '../lib/format';

function pctFmt(v: number) { return `${v.toFixed(2)}%`; }

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function monthLabel(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white';
const textareaCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none bg-white';
const labelCls = 'block text-xs font-medium text-gray-500 mb-1';

function gaugeColor(v: number, max: number): 'red' | 'amber' | 'green' {
  if (v > max) return 'red';
  if (v > max * 0.9) return 'amber';
  return 'green';
}

function dscrStatus(dscr: number): string {
  if (dscr < 1.0) return 'Below coverage';
  if (dscr < 1.25) return 'Tight coverage';
  return 'Strong coverage';
}

interface Totals { property: number; loanbacks: number; thirdParty: number; borrowing: number; employer: number; }
interface PropertySummary { property_name: string; address: string; current_value: number; }
interface LoanSummary { name: string; outstanding: number; security: string; type: 'Loanback' | 'Third Party'; }

const defaultSettings = (schemeId: string): Omit<LenderPackSettings, 'id' | 'created_at' | 'updated_at'> => ({
  scheme_id: schemeId,
  lender_pack_title: 'SSAS Lender Information Pack',
  report_date: new Date().toISOString().slice(0, 10),
  prepared_by: '',
  purpose: 'For lender due diligence, refinance assessment, and covenant review.',
  executive_summary: '',
  annual_rental_income: 0,
  annual_loan_interest_received: 0,
  annual_borrowing_interest_paid: 0,
  annual_property_expenses: 0,
  annual_scheme_expenses: 0,
  annual_loan_repayments_out: 0,
  exit_strategy_description: '',
  exit_valuation_scenarios: [],
  risk_summary: '',
});

const emptyScenario = (): ExitValuationScenario => ({
  scenario_name: '', valuation: 0, ltv: 0, borrowing_required: 0, dscr_at_exit: 0, surplus_or_deficit: 0,
});

interface Props { scheme: SsasScheme; }

export default function LenderPack({ scheme }: Props) {
  const [settings, setSettings] = useState<LenderPackSettings | null>(null);
  const [draft, setDraft] = useState<Omit<LenderPackSettings, 'id' | 'created_at' | 'updated_at'>>(defaultSettings(scheme.id));
  const [totals, setTotals] = useState<Totals>({ property: 0, loanbacks: 0, thirdParty: 0, borrowing: 0, employer: 0 });
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [loans, setLoans] = useState<LoanSummary[]>([]);
  const [cashflow, setCashflow] = useState<CashflowSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsData, prop, lb, tp, borrow, emp, cf] = await Promise.all([
      supabase.from('lender_pack_settings').select('*').eq('scheme_id', scheme.id).maybeSingle(),
      supabase.from('property_register').select('property_name, address, current_value').eq('scheme_id', scheme.id),
      supabase.from('loanback_register').select('employer_name, outstanding_balance, security').eq('scheme_id', scheme.id),
      supabase.from('third_party_loans').select('borrower_name, outstanding_balance, security').eq('scheme_id', scheme.id),
      supabase.from('borrowing_register').select('outstanding_balance').eq('scheme_id', scheme.id),
      supabase.from('employer_related_investments').select('amount').eq('scheme_id', scheme.id),
      supabase.from('cashflow_settings').select('*').eq('scheme_id', scheme.id).maybeSingle(),
    ]);

    if (settingsData.data) {
      const d = { ...settingsData.data, exit_valuation_scenarios: settingsData.data.exit_valuation_scenarios ?? [] };
      setSettings(d as LenderPackSettings);
      setDraft(d as Omit<LenderPackSettings, 'id' | 'created_at' | 'updated_at'>);
    }

    setProperties(prop.data ?? []);
    setLoans([
      ...(lb.data ?? []).map(r => ({ name: r.employer_name, outstanding: Number(r.outstanding_balance), security: r.security ?? '', type: 'Loanback' as const })),
      ...(tp.data ?? []).map(r => ({ name: r.borrower_name, outstanding: Number(r.outstanding_balance), security: r.security ?? '', type: 'Third Party' as const })),
    ]);
    setTotals({
      property: (prop.data ?? []).reduce((s, r) => s + Number(r.current_value), 0),
      loanbacks: (lb.data ?? []).reduce((s, r) => s + Number(r.outstanding_balance), 0),
      thirdParty: (tp.data ?? []).reduce((s, r) => s + Number(r.outstanding_balance), 0),
      borrowing: (borrow.data ?? []).reduce((s, r) => s + Number(r.outstanding_balance), 0),
      employer: (emp.data ?? []).reduce((s, r) => s + Number(r.amount), 0),
    });
    if (cf.data) setCashflow(cf.data);
    setLoading(false);
  }, [scheme.id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    const payload = { ...draft, updated_at: new Date().toISOString() };
    if (settings) {
      await supabase.from('lender_pack_settings').update(payload).eq('id', settings.id);
    } else {
      const { data } = await supabase.from('lender_pack_settings').insert(draft).select().single();
      if (data) setSettings(data as LenderPackSettings);
    }
    setSaving(false);
  }

  const set = (f: string, v: unknown) => setDraft(d => ({ ...d, [f]: v }));

  const setScenario = (i: number, f: keyof ExitValuationScenario, v: unknown) => {
    const updated = draft.exit_valuation_scenarios.map((s, idx) => idx === i ? { ...s, [f]: v } : s);
    set('exit_valuation_scenarios', updated);
  };
  const addScenario = () => set('exit_valuation_scenarios', [...draft.exit_valuation_scenarios, emptyScenario()]);
  const removeScenario = (i: number) => set('exit_valuation_scenarios', draft.exit_valuation_scenarios.filter((_, idx) => idx !== i));

  // Cashflow rows
  const forecastRows = (() => {
    if (!cashflow) return [];
    const n = Math.min(Number(cashflow.forecast_horizon_months), 60);
    const inflows = Number(cashflow.monthly_employer_contributions) + Number(cashflow.monthly_member_contributions) + Number(cashflow.monthly_rental_income) + Number(cashflow.monthly_loan_interest_received) + Number(cashflow.monthly_other_income);
    const outflows = Number(cashflow.monthly_loan_repayments_out) + Number(cashflow.monthly_borrowing_interest_paid) + Number(cashflow.monthly_property_expenses) + Number(cashflow.monthly_scheme_expenses) + Number(cashflow.monthly_benefit_payments) + Number(cashflow.monthly_other_outflows);
    const net = inflows - outflows;
    const rows: { date: string; closing: number }[] = [];
    for (let i = 1; i <= n; i++) {
      const opening = i === 1 ? Number(cashflow.opening_cash) : rows[i - 2].closing;
      rows.push({ date: addMonths(cashflow.forecast_start_date, i), closing: opening + net });
    }
    return rows;
  })();

  const nav = Number(scheme.net_asset_value);
  const maxLoanback = 0.5 * nav;
  const maxBorrowing = 0.5 * nav;
  const maxEmployer = 0.20 * nav;

  // DSCR
  const noi = Number(draft.annual_rental_income) + Number(draft.annual_loan_interest_received)
    - Number(draft.annual_property_expenses) - Number(draft.annual_scheme_expenses);
  const debtService = Number(draft.annual_borrowing_interest_paid) + Number(draft.annual_loan_repayments_out);
  const dscr = debtService > 0 ? noi / debtService : 0;
  const dscrSt = dscrStatus(dscr);
  const dscrColor = dscrSt === 'Below coverage' ? 'text-red-600' : dscrSt === 'Tight coverage' ? 'text-amber-600' : 'text-emerald-600';

  const barSeries = [
    { name: 'HMRC Limit', color: '#e5e7eb', values: [maxLoanback, maxBorrowing, maxEmployer] },
    { name: 'Used', color: '#ef4444', values: [totals.loanbacks, totals.borrowing, totals.employer] },
  ];

  const minCash = forecastRows.length ? Math.min(...forecastRows.map(r => r.closing)) : Number(scheme.cash_balance);
  const finalCash = forecastRows[forecastRows.length - 1]?.closing ?? Number(scheme.cash_balance);

  if (loading) return <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lender Pack</h1>
          <p className="text-sm text-gray-500 mt-0.5">Lender-ready information pack with DSCR, HMRC headroom and exit analysis</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <Save size={14} />{saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
            <Printer size={14} /> Export Lender Pack (PDF)
          </button>
        </div>
      </div>

      {/* ===== PRINTABLE CONTENT ===== */}
      <div className="print-content space-y-6">

        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Pack Title', field: 'lender_pack_title', span: 2 },
                { label: 'Report Date', field: 'report_date', type: 'date' },
                { label: 'Prepared By', field: 'prepared_by' },
                { label: 'Purpose', field: 'purpose', span: 2 },
              ].map(({ label, field, type, span }) => (
                <div key={field} className={span === 2 ? 'col-span-2' : ''}>
                  <label className={labelCls}>{label}</label>
                  <input type={type ?? 'text'} value={String((draft as Record<string, unknown>)[field] ?? '')} onChange={e => set(field, e.target.value)} className={`${inputCls} no-print`} />
                  <p className="hidden print:block text-sm font-medium text-gray-800">{String((draft as Record<string, unknown>)[field] ?? '—')}</p>
                </div>
              ))}
            </div>
            <div className="shrink-0 no-print">
              <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center">
                <span className="text-white font-black text-sm">RH</span>
              </div>
            </div>
            <div className="hidden print:flex flex-col items-end shrink-0">
              <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center">
                <span className="text-white font-black text-xs">RH</span>
              </div>
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Executive Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {[
              { label: 'Net Asset Value', value: fmtFull(nav) },
              { label: 'Cash Available', value: fmtFull(Number(scheme.cash_balance)) },
              { label: 'Total Property Assets', value: fmtFull(totals.property) },
            ].map(c => (
              <div key={c.label} className="bg-gray-50 rounded-lg p-4 print:border print:border-gray-200 print:bg-white">
                <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                <p className="text-xl font-bold text-gray-900">{c.value}</p>
              </div>
            ))}
          </div>
          <textarea
            value={draft.executive_summary}
            onChange={e => set('executive_summary', e.target.value)}
            rows={4}
            placeholder="Provide a concise overview of the scheme's financial strength, asset base, loanback position, borrowing, and refinance strategy."
            className={`${textareaCls} no-print`}
          />
          <div className="hidden print:block text-sm text-gray-700 leading-relaxed whitespace-pre-wrap min-h-[60px] border border-gray-200 rounded-lg p-3">
            {draft.executive_summary || 'To be completed.'}
          </div>
        </div>

        {/* Asset & Security Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 print:shadow-none print:border-gray-300">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Property Security</h2>
            {properties.length === 0 ? (
              <p className="text-sm text-gray-400">No properties recorded.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Property', 'Address', 'Value'].map(h => <th key={h} className="text-left py-2 pr-3 font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {properties.map((p, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 font-medium text-gray-800">{p.property_name}</td>
                      <td className="py-2 pr-3 text-gray-500 max-w-[100px] truncate">{p.address || '—'}</td>
                      <td className="py-2 font-semibold text-gray-800">{fmt(Number(p.current_value))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td colSpan={2} className="py-2 font-semibold text-gray-700">Total</td>
                    <td className="py-2 font-bold text-gray-900">{fmt(totals.property)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 print:shadow-none print:border-gray-300">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Loan Security</h2>
            {loans.length === 0 ? (
              <p className="text-sm text-gray-400">No loans recorded.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Borrower', 'Type', 'Outstanding', 'Security'].map(h => <th key={h} className="text-left py-2 pr-3 font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loans.map((l, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 font-medium text-gray-800">{l.name}</td>
                      <td className="py-2 pr-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${l.type === 'Loanback' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{l.type}</span>
                      </td>
                      <td className="py-2 pr-3 font-semibold text-gray-800">{fmt(l.outstanding)}</td>
                      <td className="py-2 text-gray-500 max-w-[100px] truncate">{l.security || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* HMRC Capacity & Gauges */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-5">HMRC Capacity & Headroom</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {[
              { title: 'Loanback Headroom', max: maxLoanback, used: totals.loanbacks, pctLabel: '50% NAV' },
              { title: 'Borrowing Headroom', max: maxBorrowing, used: totals.borrowing, pctLabel: '50% NAV' },
              { title: 'Employer Inv. Headroom', max: maxEmployer, used: totals.employer, pctLabel: '20% NAV' },
            ].map(c => {
              const remaining = c.max - c.used;
              return (
                <div key={c.title} className="flex flex-col items-center gap-3">
                  <GaugeChart
                    value={c.used}
                    max={c.max}
                    label={`${c.title} (${c.pctLabel})`}
                    color={gaugeColor(c.used, c.max)}
                  />
                  <div className="w-full bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-gray-500">Limit</span><span className="font-semibold text-gray-700">{fmt(c.max)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Used</span><span className="font-semibold text-gray-700">{fmt(c.used)}</span></div>
                    <div className="flex justify-between pt-1 border-t border-gray-200"><span className="text-gray-600 font-medium">Remaining</span><span className={`font-bold ${remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(remaining)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
          <BarChart categories={['Loanback', 'Borrowing', 'Employer Inv.']} series={barSeries} />
        </div>

        {/* Cashflow & Liquidity */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Cashflow & Liquidity</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {[
              { label: 'Current Cash Position', value: fmtFull(Number(scheme.cash_balance)), color: '' },
              { label: 'Lowest Projected Cash', value: forecastRows.length ? fmtFull(minCash) : '—', color: minCash < 0 ? 'text-red-600' : '' },
              { label: 'Forecast Closing Cash', value: forecastRows.length ? fmtFull(finalCash) : '—', color: finalCash < 0 ? 'text-red-600' : '' },
            ].map(c => (
              <div key={c.label} className="bg-gray-50 rounded-lg p-4 print:border print:border-gray-200 print:bg-white">
                <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                <p className={`text-xl font-bold ${c.color || 'text-gray-900'}`}>{c.value}</p>
              </div>
            ))}
          </div>
          {forecastRows.length > 0 ? (
            <LineChart
              labels={forecastRows.map(r => monthLabel(r.date))}
              series={[
                { name: 'Closing Cash', color: '#3b82f6', values: forecastRows.map(r => r.closing) },
                ...(cashflow && Number(cashflow.target_min_cash_buffer) > 0
                  ? [{ name: 'Min Buffer', color: '#ef4444', values: forecastRows.map(() => Number(cashflow!.target_min_cash_buffer)), dashed: true }]
                  : []),
              ]}
            />
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">Configure the Cashflow Forecast page to show projections here.</p>
          )}
        </div>

        {/* DSCR & Covenant Metrics */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">DSCR & Covenant Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
            {[
              { label: 'Annual Rental Income', field: 'annual_rental_income' },
              { label: 'Annual Loan Interest Received', field: 'annual_loan_interest_received' },
              { label: 'Annual Borrowing Interest Paid', field: 'annual_borrowing_interest_paid' },
              { label: 'Annual Property Expenses', field: 'annual_property_expenses' },
              { label: 'Annual Scheme Expenses', field: 'annual_scheme_expenses' },
              { label: 'Annual Loan Repayments Out', field: 'annual_loan_repayments_out' },
            ].map(({ label, field }) => (
              <div key={field}>
                <label className={`${labelCls} no-print`}>{label}</label>
                <CurrencyInput
                  value={Number((draft as Record<string, unknown>)[field])}
                  onChange={v => set(field, v)}
                  className="no-print"
                />
                <div className="hidden print:block">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-sm font-semibold text-gray-800">{fmt(Number((draft as Record<string, unknown>)[field]))}</p>
                </div>
              </div>
            ))}
          </div>

          {/* DSCR result */}
          <div className="bg-gray-50 rounded-xl p-5 flex flex-wrap gap-8 items-center print:border print:border-gray-200 print:bg-white">
            <div>
              <p className="text-xs text-gray-500 mb-1">Net Operating Income</p>
              <p className="text-lg font-bold text-gray-900">{fmt(noi)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Rental + Interest received − Property & scheme expenses</p>
            </div>
            <div className="text-gray-300 text-2xl">÷</div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Total Debt Service</p>
              <p className="text-lg font-bold text-gray-900">{fmt(debtService)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Borrowing interest + loan repayments</p>
            </div>
            <div className="text-gray-300 text-2xl">=</div>
            <div>
              <p className="text-xs text-gray-500 mb-1">DSCR</p>
              <p className={`text-3xl font-black ${dscrColor}`}>{debtService > 0 ? dscr.toFixed(2) : '—'}</p>
              {debtService > 0 && <StatusBadge status={dscrSt} />}
            </div>
          </div>
        </div>

        {/* Exit Strategy */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Exit Strategy</h2>
          <textarea
            value={draft.exit_strategy_description}
            onChange={e => set('exit_strategy_description', e.target.value)}
            rows={4}
            placeholder="Describe refinance route, timing, lender type, expected valuation, and repayment waterfall."
            className={`${textareaCls} no-print mb-4`}
          />
          <div className="hidden print:block text-sm text-gray-700 leading-relaxed whitespace-pre-wrap min-h-[60px] border border-gray-200 rounded-lg p-3 mb-4">
            {draft.exit_strategy_description || 'To be completed.'}
          </div>

          {/* Exit scenarios table */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-600">Exit Valuation Scenarios</h3>
            <button onClick={addScenario} className="no-print flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              <Plus size={12} /> Add Scenario
            </button>
          </div>
          {draft.exit_valuation_scenarios.length === 0 ? (
            <p className="text-sm text-gray-400 no-print">No exit scenarios. Click "Add Scenario" to model exit options.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Scenario', 'Valuation (£)', 'LTV (%)', 'Borrowing (£)', 'DSCR', 'Surplus/Deficit (£)', ''].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {draft.exit_valuation_scenarios.map((sc, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">
                        <input value={sc.scenario_name} onChange={e => setScenario(i, 'scenario_name', e.target.value)} className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-500 no-print" />
                        <span className="hidden print:block text-sm font-medium text-gray-800">{sc.scenario_name}</span>
                      </td>
                      {[
                        { f: 'valuation', isCurrency: true, fmtFn: fmt },
                        { f: 'ltv', isCurrency: false, fmtFn: pctFmt },
                        { f: 'borrowing_required', isCurrency: true, fmtFn: fmt },
                        { f: 'dscr_at_exit', isCurrency: false, fmtFn: (v: number) => v.toFixed(2) },
                        { f: 'surplus_or_deficit', isCurrency: true, fmtFn: fmt },
                      ].map(({ f, isCurrency, fmtFn }) => (
                        <td key={f} className="px-4 py-2">
                          {isCurrency ? (
                            <CurrencyInput
                              value={Number((sc as Record<string, unknown>)[f])}
                              onChange={v => setScenario(i, f as keyof ExitValuationScenario, v)}
                              className="w-32 no-print"
                            />
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              value={Number((sc as Record<string, unknown>)[f])}
                              onChange={e => setScenario(i, f as keyof ExitValuationScenario, parseFloat(e.target.value) || 0)}
                              className="w-20 text-sm border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-red-500 no-print"
                            />
                          )}
                          <span className="hidden print:block text-sm text-gray-700">{fmtFn(Number((sc as Record<string, unknown>)[f]))}</span>
                        </td>
                      ))}
                      <td className="px-4 py-2 no-print">
                        <button onClick={() => removeScenario(i)} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Risk Summary */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Risk Summary</h2>
          <p className="text-xs text-gray-400 mb-2 no-print">
            Summarise key risks: tenant concentration, liquidity, valuation sensitivity, loanback exposure, ERI exposure, and refinance timing.
          </p>
          <textarea
            value={draft.risk_summary}
            onChange={e => set('risk_summary', e.target.value)}
            rows={6}
            placeholder="Summarise key risks relevant to lenders: tenant concentration, liquidity, valuation sensitivity, loanback exposure, ERI exposure, and refinance timing."
            className={`${textareaCls} no-print`}
          />
          <div className="hidden print:block text-sm text-gray-700 leading-relaxed whitespace-pre-wrap min-h-[80px] border border-gray-200 rounded-lg p-3">
            {draft.risk_summary || 'To be completed.'}
          </div>
        </div>

        {/* Print footer */}
        <div className="hidden print:block text-xs text-gray-400 text-center pt-4 border-t border-gray-200">
          Generated by Red Horizons SSAS Utilisation Planner — {new Date().toLocaleDateString('en-GB')} — Strictly Confidential — Not for distribution without prior consent
        </div>
      </div>
    </div>
  );
}
