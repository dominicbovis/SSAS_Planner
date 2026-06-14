import { useEffect, useState, useCallback } from 'react';
import { Save, RefreshCw, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, RefinanceWaterfallSettings, DebtOverride } from '../types';
import BarChart from '../components/BarChart';
import StatusBadge from '../components/StatusBadge';
import CurrencyInput from '../components/CurrencyInput';
import { fmt } from '../lib/format';

function pctFmt(v: number) { return `${v.toFixed(2)}%`; }

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500';
const labelCls = 'block text-xs font-medium text-gray-500 mb-1';

interface BorrowingRow { id: string; lender_name: string; outstanding_balance: number; }

interface Props { scheme: SsasScheme; }

const defaultDraft = (schemeId: string): Omit<RefinanceWaterfallSettings, 'id' | 'created_at' | 'updated_at'> => ({
  scheme_id: schemeId,
  refinance_date: new Date().toISOString().slice(0, 10),
  refinance_valuation: 0,
  target_ltv: 65,
  new_loan_margin: 5,
  new_loan_term_years: 5,
  transaction_costs: 0,
  projected_annual_noi: 0,
  debt_overrides: [],
});

export default function RefinanceWaterfall({ scheme }: Props) {
  const [settings, setSettings] = useState<RefinanceWaterfallSettings | null>(null);
  const [draft, setDraft] = useState<Omit<RefinanceWaterfallSettings, 'id' | 'created_at' | 'updated_at'>>(defaultDraft(scheme.id));
  const [borrowings, setBorrowings] = useState<BorrowingRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [sData, bData, vsData] = await Promise.all([
      supabase.from('refinance_waterfall_settings').select('*').eq('scheme_id', scheme.id).maybeSingle(),
      supabase.from('borrowing_register').select('id, lender_name, outstanding_balance').eq('scheme_id', scheme.id),
      supabase.from('valuation_settings').select('*').eq('scheme_id', scheme.id).maybeSingle(),
    ]);

    const rows: BorrowingRow[] = (bData.data ?? []).map(r => ({
      id: r.id, lender_name: r.lender_name, outstanding_balance: Number(r.outstanding_balance),
    }));
    setBorrowings(rows);

    if (sData.data) {
      const d = {
        ...sData.data,
        debt_overrides: (sData.data.debt_overrides ?? []) as DebtOverride[],
      };
      setSettings(d as RefinanceWaterfallSettings);
      // Sync any new borrowing rows not yet in overrides
      const overrides = mergeOverrides(rows, d.debt_overrides as DebtOverride[]);
      setDraft({ ...d, debt_overrides: overrides });
    } else {
      const d = defaultDraft(scheme.id);
      // Seed valuation from valuation model if available
      if (vsData.data) {
        const capRate = Number(vsData.data.capitalisation_rate) / 100;
        const vacPct = Number(vsData.data.vacancy_allowance_pct) / 100;
        // We can't easily recompute here without property data, just leave 0
        void capRate; void vacPct;
      }
      d.debt_overrides = mergeOverrides(rows, []);
      setDraft(d);
    }
    setLoading(false);
  }, [scheme.id]);

  function mergeOverrides(rows: BorrowingRow[], existing: DebtOverride[]): DebtOverride[] {
    return rows.map(r => {
      const ex = existing.find(e => e.borrowing_id === r.id);
      return ex ?? {
        borrowing_id: r.id,
        lender_name: r.lender_name,
        principal_outstanding: r.outstanding_balance,
        break_costs: 0,
        fees_payable: 0,
      };
    });
  }

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    const payload = { ...draft, updated_at: new Date().toISOString() };
    if (settings) {
      await supabase.from('refinance_waterfall_settings').update(payload).eq('id', settings.id);
    } else {
      const { data } = await supabase.from('refinance_waterfall_settings').insert(draft).select().single();
      if (data) setSettings(data as RefinanceWaterfallSettings);
    }
    setSaving(false);
  }

  const set = (f: string, v: unknown) => setDraft(d => ({ ...d, [f]: v }));

  const updateOverride = (idx: number, field: keyof DebtOverride, val: unknown) => {
    const updated = draft.debt_overrides.map((o, i) => i === idx ? { ...o, [field]: val } : o);
    set('debt_overrides', updated);
  };

  // ---- Computed values ----
  const refinanceVal = Number(draft.refinance_valuation);
  const targetLTV = Number(draft.target_ltv) / 100;
  const maxNewLoan = refinanceVal * targetLTV;
  const newLoanMargin = Number(draft.new_loan_margin) / 100;
  const transactionCosts = Number(draft.transaction_costs);
  const projectedNOI = Number(draft.projected_annual_noi);

  const debtRows = draft.debt_overrides.map(o => ({
    ...o,
    totalToRepay: Number(o.principal_outstanding) + Number(o.break_costs) + Number(o.fees_payable),
  }));
  const totalExistingDebt = debtRows.reduce((s, r) => s + r.totalToRepay, 0);

  const netCashReleased = maxNewLoan - totalExistingDebt - transactionCosts;
  const postRefinanceLTV = refinanceVal > 0 ? (maxNewLoan / refinanceVal) * 100 : 0;
  const newLoanInterest = maxNewLoan * newLoanMargin;
  const dscrNewLoan = newLoanInterest > 0 ? projectedNOI / newLoanInterest : 0;

  const dscrStatus = dscrNewLoan === 0 ? '—' : dscrNewLoan < 1.0 ? 'Below coverage' : dscrNewLoan < 1.25 ? 'Tight coverage' : 'Strong coverage';
  const dscrColor = dscrNewLoan === 0 ? 'text-gray-400' : dscrNewLoan < 1.0 ? 'text-red-600' : dscrNewLoan < 1.25 ? 'text-amber-600' : 'text-emerald-600';

  const waterfallRows = [
    { item: 'New Loan Proceeds', amount: maxNewLoan, isPositive: true, bold: false },
    { item: 'Repay Existing Debt', amount: -totalExistingDebt, isPositive: false, bold: false },
    { item: 'Transaction Costs', amount: -transactionCosts, isPositive: false, bold: false },
    { item: 'Net Cash Released', amount: netCashReleased, isPositive: netCashReleased >= 0, bold: true },
  ];

  const barSeries = [
    { name: 'New Loan', color: '#3b82f6', values: [maxNewLoan] },
    { name: 'Existing Debt', color: '#ef4444', values: [totalExistingDebt] },
    { name: 'Transaction Costs', color: '#f59e0b', values: [transactionCosts] },
    { name: 'Net Cash Released', color: netCashReleased >= 0 ? '#10b981' : '#dc2626', values: [Math.max(netCashReleased, 0)] },
  ];

  if (loading) return <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Refinance Waterfall</h1>
          <p className="text-sm text-gray-500 mt-0.5">Model new loan proceeds, debt repayment and net cash released</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
            <Save size={14} />{saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Refinance Inputs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Refinance Inputs</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
          <div>
            <label className={labelCls}>Refinance Date</label>
            <input type="date" value={draft.refinance_date} onChange={e => set('refinance_date', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Refinance Valuation</label>
            <CurrencyInput value={Number(draft.refinance_valuation)} onChange={v => set('refinance_valuation', v)} />
          </div>
          <div>
            <label className={labelCls}>Target LTV (%)</label>
            <input type="number" step="0.5" value={Number(draft.target_ltv)} onChange={e => set('target_ltv', parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>New Loan Margin (%)</label>
            <input type="number" step="0.1" value={Number(draft.new_loan_margin)} onChange={e => set('new_loan_margin', parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>New Loan Term (years)</label>
            <input type="number" step="1" min="1" value={Number(draft.new_loan_term_years)} onChange={e => set('new_loan_term_years', parseInt(e.target.value) || 5)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Transaction Costs</label>
            <CurrencyInput value={Number(draft.transaction_costs)} onChange={v => set('transaction_costs', v)} />
          </div>
        </div>

        {/* Max new loan callout */}
        <div className="mt-4 flex items-center gap-3 bg-blue-50 rounded-lg px-4 py-3">
          <Info size={14} className="text-blue-500 shrink-0" />
          <p className="text-sm text-blue-700">
            Maximum New Loan = {fmt(refinanceVal)} × {pctFmt(Number(draft.target_ltv))} = <strong>{fmt(maxNewLoan)}</strong>
          </p>
        </div>
      </div>

      {/* Existing Debt Schedule */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Existing Debt Schedule</h2>
          <p className="text-xs text-gray-400">Drawn from Borrowing Register — edit break costs and fees below</p>
        </div>
        {debtRows.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No borrowing recorded. Add entries in the Borrowing Register.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Lender', 'Principal Outstanding', 'Break Costs', 'Fees Payable', 'Total to Repay'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {debtRows.map((row, i) => (
                  <tr key={row.borrowing_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800">{row.lender_name}</td>
                    <td className="px-5 py-3">
                      <CurrencyInput value={Number(row.principal_outstanding)} onChange={v => updateOverride(i, 'principal_outstanding', v)} className="w-40" />
                    </td>
                    <td className="px-5 py-3">
                      <CurrencyInput value={Number(row.break_costs)} onChange={v => updateOverride(i, 'break_costs', v)} className="w-36" />
                    </td>
                    <td className="px-5 py-3">
                      <CurrencyInput value={Number(row.fees_payable)} onChange={v => updateOverride(i, 'fees_payable', v)} className="w-36" />
                    </td>
                    <td className="px-5 py-3 font-bold text-gray-900">{fmt(row.totalToRepay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-5 py-3 text-sm font-semibold text-gray-700" colSpan={4}>Total Existing Debt to Repay</td>
                  <td className="px-5 py-3 text-sm font-bold text-red-700">{fmt(totalExistingDebt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Waterfall */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Waterfall table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Refinance Waterfall</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
              </tr>
            </thead>
            <tbody>
              {waterfallRows.map((r, i) => {
                const isSeparator = r.item === 'Net Cash Released';
                return (
                  <tr key={i} className={isSeparator ? 'border-t-2 border-gray-300' : 'border-b border-gray-50'}>
                    <td className={`py-3 ${r.bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                      {r.item}
                    </td>
                    <td className={`py-3 text-right font-${r.bold ? 'bold' : 'semibold'} ${r.isPositive ? (r.bold ? 'text-emerald-600' : 'text-gray-800') : 'text-red-600'}`}>
                      {r.bold
                        ? <span className={`text-lg ${netCashReleased < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(r.amount)}</span>
                        : fmt(r.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Visual flow */}
          <div className="mt-5 space-y-2">
            {[
              { label: 'New Loan', value: maxNewLoan, color: 'bg-blue-500', max: maxNewLoan },
              { label: 'Repay Debt', value: totalExistingDebt, color: 'bg-red-400', max: maxNewLoan },
              { label: 'Costs', value: transactionCosts, color: 'bg-amber-400', max: maxNewLoan },
            ].map(b => (
              <div key={b.label} className="flex items-center gap-3 text-xs">
                <span className="w-20 text-gray-500 shrink-0">{b.label}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.min((b.value / (maxNewLoan || 1)) * 100, 100)}%` }} />
                </div>
                <span className="w-24 text-right font-medium text-gray-700">{fmt(b.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar chart */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Waterfall Breakdown</h2>
          <BarChart categories={['Refinance']} series={barSeries} />
        </div>
      </div>

      {/* Post-Refinance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* LTV */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Post-Refinance LTV</p>
          <p className={`text-3xl font-black mb-1 ${postRefinanceLTV > 75 ? 'text-red-600' : postRefinanceLTV > 65 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {pctFmt(postRefinanceLTV)}
          </p>
          <p className="text-xs text-gray-400">{fmt(maxNewLoan)} ÷ {fmt(refinanceVal)}</p>
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${postRefinanceLTV > 75 ? 'bg-red-500' : postRefinanceLTV > 65 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(postRefinanceLTV, 100)}%` }} />
          </div>
        </div>

        {/* Net Cash Released */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Net Cash Released</p>
          <p className={`text-3xl font-black mb-1 ${netCashReleased < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {fmt(netCashReleased)}
          </p>
          <p className="text-xs text-gray-400">
            {netCashReleased < 0 ? 'Shortfall — additional equity required' : 'Available after repayment and costs'}
          </p>
        </div>

        {/* DSCR on new loan */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Indicative DSCR — New Loan</p>
          <div className="mb-3">
            <label className={labelCls}>Projected Annual NOI</label>
            <CurrencyInput value={Number(draft.projected_annual_noi)} onChange={v => set('projected_annual_noi', v)} />
          </div>
          <div className="pt-3 border-t border-gray-100">
            <p className={`text-3xl font-black mb-1 ${dscrColor}`}>{newLoanInterest > 0 ? dscrNewLoan.toFixed(2) : '—'}</p>
            {newLoanInterest > 0 && <StatusBadge status={dscrStatus} />}
            <p className="text-xs text-gray-400 mt-1">
              NOI {fmt(projectedNOI)} ÷ Interest {fmt(newLoanInterest)}
            </p>
          </div>
        </div>
      </div>

      {/* New loan summary */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">New Loan Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          {[
            { label: 'Loan Amount', value: fmt(maxNewLoan) },
            { label: 'Term', value: `${draft.new_loan_term_years} years` },
            { label: 'Margin', value: pctFmt(Number(draft.new_loan_margin)) },
            { label: 'Annual Interest', value: fmt(newLoanInterest) },
            { label: 'Valuation', value: fmt(refinanceVal) },
          ].map(c => (
            <div key={c.label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className="font-bold text-gray-900">{c.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
