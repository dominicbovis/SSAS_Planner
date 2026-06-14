import { useEffect, useState, useCallback } from 'react';
import { Printer, Save, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, TrusteeReportSettings, CashflowSettings } from '../types';
import BarChart from '../components/BarChart';
import LineChart from '../components/LineChart';
import StatusBadge from '../components/StatusBadge';

function fmt(v: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(v);
}

function fmtFull(v: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 }).format(v);
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function capacityStatus(remaining: number, max: number): 'OK' | 'Warning' | 'Breach' {
  if (remaining < 0) return 'Breach';
  if (remaining < 0.1 * max) return 'Warning';
  return 'OK';
}

interface Totals {
  property: number;
  loanbacks: number;
  thirdParty: number;
  borrowing: number;
  employer: number;
  perEmployerBreach: boolean;
}

interface Props { scheme: SsasScheme; }

const defaultSettings = (schemeId: string, schemeName: string): Omit<TrusteeReportSettings, 'id' | 'created_at' | 'updated_at'> => ({
  scheme_id: schemeId,
  report_title: 'SSAS Trustee Utilisation & Compliance Report',
  report_date: new Date().toISOString().slice(0, 10),
  prepared_by: '',
  period_covered: '',
  exec_summary_text: `During the period, ${schemeName} maintained utilisation within HMRC limits for loanbacks, borrowing and employer-related investments. Key utilisation metrics, capacity headroom and projected liquidity are summarised below.`,
  compliance_commentary: '',
  trustee_name: '',
  trustee_sign_off_date: null,
});

export default function TrusteeReport({ scheme }: Props) {
  const [settings, setSettings] = useState<TrusteeReportSettings | null>(null);
  const [draft, setDraft] = useState<Omit<TrusteeReportSettings, 'id' | 'created_at' | 'updated_at'> | null>(null);
  const [totals, setTotals] = useState<Totals>({ property: 0, loanbacks: 0, thirdParty: 0, borrowing: 0, employer: 0, perEmployerBreach: false });
  const [cashflow, setCashflow] = useState<CashflowSettings | null>(null);
  const [properties, setProperties] = useState<{ property_name: string; address: string; current_value: number }[]>([]);
  const [loanbackRows, setLoanbackRows] = useState<{ employer_name: string; loan_amount: number; outstanding_balance: number }[]>([]);
  const [thirdPartyRows, setThirdPartyRows] = useState<{ borrower_name: string; loan_amount: number; outstanding_balance: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [repData, prop, lb, tp, borrow, emp, cf] = await Promise.all([
      supabase.from('trustee_report_settings').select('*').eq('scheme_id', scheme.id).maybeSingle(),
      supabase.from('property_register').select('property_name, address, current_value').eq('scheme_id', scheme.id),
      supabase.from('loanback_register').select('employer_name, loan_amount, outstanding_balance').eq('scheme_id', scheme.id),
      supabase.from('third_party_loans').select('borrower_name, loan_amount, outstanding_balance').eq('scheme_id', scheme.id),
      supabase.from('borrowing_register').select('outstanding_balance').eq('scheme_id', scheme.id),
      supabase.from('employer_related_investments').select('employer_name, amount').eq('scheme_id', scheme.id),
      supabase.from('cashflow_settings').select('*').eq('scheme_id', scheme.id).maybeSingle(),
    ]);

    if (repData.data) { setSettings(repData.data); setDraft({ ...repData.data }); }
    else { const d = defaultSettings(scheme.id, scheme.name); setDraft(d); }

    setProperties(prop.data ?? []);
    setLoanbackRows(lb.data ?? []);
    setThirdPartyRows(tp.data ?? []);

    const property = (prop.data ?? []).reduce((s, r) => s + Number(r.current_value), 0);
    const loanbacks = (lb.data ?? []).reduce((s, r) => s + Number(r.outstanding_balance), 0);
    const thirdParty = (tp.data ?? []).reduce((s, r) => s + Number(r.outstanding_balance), 0);
    const borrowing = (borrow.data ?? []).reduce((s, r) => s + Number(r.outstanding_balance), 0);
    const empData = emp.data ?? [];
    const employer = empData.reduce((s, r) => s + Number(r.amount), 0);
    const perLimit = 0.05 * Number(scheme.net_asset_value);
    const grouped: Record<string, number> = {};
    empData.forEach(r => { grouped[r.employer_name] = (grouped[r.employer_name] ?? 0) + Number(r.amount); });
    setTotals({ property, loanbacks, thirdParty, borrowing, employer, perEmployerBreach: Object.values(grouped).some(v => v > perLimit) });

    if (cf.data) setCashflow(cf.data);
    setLoading(false);
  }, [scheme.id, scheme.name, scheme.net_asset_value]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    if (settings) {
      await supabase.from('trustee_report_settings').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', settings.id);
    } else {
      const { data } = await supabase.from('trustee_report_settings').insert(draft).select().single();
      if (data) setSettings(data);
    }
    setSaving(false);
  }

  const set = (f: string, v: unknown) => setDraft(d => d ? { ...d, [f]: v } : d);

  // Cashflow forecast rows for chart
  const forecastRows = (() => {
    if (!cashflow) return [];
    const n = Math.min(Number(cashflow.forecast_horizon_months), 36);
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

  const finalCashflow = forecastRows[forecastRows.length - 1]?.closing ?? Number(scheme.cash_balance);
  const minCashflow = forecastRows.length ? Math.min(...forecastRows.map(r => r.closing)) : Number(scheme.cash_balance);

  const nav = Number(scheme.net_asset_value);
  const maxLoanback = 0.5 * nav;
  const maxBorrowing = 0.5 * nav;
  const maxEmployer = 0.20 * nav;
  const remainingLoanback = maxLoanback - totals.loanbacks;
  const remainingBorrowing = maxBorrowing - totals.borrowing;
  const remainingEmployer = maxEmployer - totals.employer;

  const barSeries = [
    { name: 'HMRC Limit', color: '#e5e7eb', values: [maxLoanback, maxBorrowing, maxEmployer] },
    { name: 'Used', color: '#ef4444', values: [totals.loanbacks, totals.borrowing, totals.employer] },
  ];

  const empStatus = totals.perEmployerBreach ? 'Per-employer breach' : remainingEmployer < 0 ? 'Aggregate breach' : 'OK';

  if (!draft) return <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>;

  const inputCls = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white";
  const textareaCls = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none bg-white";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1";

  return (
    <div className="space-y-6">
      {/* Controls — hidden when printing */}
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trustee Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Single-period utilisation and compliance report</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            <Printer size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* ===== PRINTABLE REPORT ===== */}
      <div id="trustee-report" className="space-y-6 print-content">

        {/* Report Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border print:border-gray-300">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Report Title</label>
                  <input value={draft.report_title} onChange={e => set('report_title', e.target.value)} className={`${inputCls} no-print`} />
                  <p className="hidden print:block text-xl font-bold text-gray-900">{draft.report_title}</p>
                </div>
                <div>
                  <label className={labelCls}>Scheme Name</label>
                  <input value={draft.scheme_id ? scheme.name : ''} readOnly className={`${inputCls} bg-gray-50 no-print`} />
                  <p className="hidden print:block text-sm text-gray-700">{scheme.name}</p>
                </div>
                <div>
                  <label className={labelCls}>Report Date</label>
                  <input type="date" value={draft.report_date} onChange={e => set('report_date', e.target.value)} className={`${inputCls} no-print`} />
                  <p className="hidden print:block text-sm text-gray-700">{new Date(draft.report_date).toLocaleDateString('en-GB')}</p>
                </div>
                <div>
                  <label className={labelCls}>Prepared By</label>
                  <input value={draft.prepared_by} onChange={e => set('prepared_by', e.target.value)} className={`${inputCls} no-print`} placeholder="Name / firm" />
                  <p className="hidden print:block text-sm text-gray-700">{draft.prepared_by || '—'}</p>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Period Covered</label>
                  <input value={draft.period_covered} onChange={e => set('period_covered', e.target.value)} className={`${inputCls} no-print`} placeholder="e.g. 1 Jan 2025 – 31 Dec 2025" />
                  <p className="hidden print:block text-sm text-gray-700">{draft.period_covered || '—'}</p>
                </div>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1 no-print">
              <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center">
                <span className="text-white font-black text-sm">RH</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Red Horizons</p>
            </div>
            {/* Print-only logo */}
            <div className="hidden print:flex flex-col items-end shrink-0">
              <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center">
                <span className="text-white font-black text-xs">RH</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Red Horizons</p>
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Executive Summary</h2>
          <div className="mb-4">
            <textarea value={draft.exec_summary_text} onChange={e => set('exec_summary_text', e.target.value)} rows={3} className={`${textareaCls} no-print`} />
            <p className="hidden print:block text-sm text-gray-700 leading-relaxed">{draft.exec_summary_text}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Net Asset Value', value: fmtFull(nav), color: 'text-gray-900' },
              { label: 'Cash Balance', value: fmtFull(Number(scheme.cash_balance)), color: 'text-gray-900' },
              { label: 'Forecast Closing Cash', value: forecastRows.length ? fmtFull(finalCashflow) : 'No forecast', color: finalCashflow < 0 ? 'text-red-600' : 'text-emerald-600' },
            ].map(c => (
              <div key={c.label} className="bg-gray-50 rounded-lg p-4 print:border print:border-gray-200 print:bg-white">
                <p className="text-xs text-gray-500 font-medium mb-1">{c.label}</p>
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Utilisation & HMRC Capacity */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Utilisation & HMRC Capacity</h2>

          {/* Utilisation table */}
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 print:bg-gray-100">
                  {['Type', 'Amount Used', 'HMRC Limit', 'Remaining Capacity', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { type: 'Commercial Property', amount: totals.property, limit: 'No HMRC limit', remaining: 'N/A', status: 'OK' },
                  { type: 'Loanbacks', amount: totals.loanbacks, limit: fmt(maxLoanback), remaining: fmt(remainingLoanback), status: capacityStatus(remainingLoanback, maxLoanback) },
                  { type: 'Third-Party Loans', amount: totals.thirdParty, limit: 'N/A', remaining: 'N/A', status: 'OK' },
                  { type: 'Borrowing', amount: totals.borrowing, limit: fmt(maxBorrowing), remaining: fmt(remainingBorrowing), status: capacityStatus(remainingBorrowing, maxBorrowing) },
                  { type: 'Employer Investments', amount: totals.employer, limit: fmt(maxEmployer), remaining: fmt(remainingEmployer), status: empStatus },
                ].map(row => (
                  <tr key={row.type} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{row.type}</td>
                    <td className="px-4 py-2 text-gray-700">{fmtFull(row.amount)}</td>
                    <td className="px-4 py-2 text-gray-600">{row.limit}</td>
                    <td className="px-4 py-2 text-gray-600">{row.remaining}</td>
                    <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* HMRC capacity cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              { title: 'Loanbacks', limit: maxLoanback, used: totals.loanbacks, remaining: remainingLoanback, pctLabel: '50% NAV', status: capacityStatus(remainingLoanback, maxLoanback) },
              { title: 'Borrowing', limit: maxBorrowing, used: totals.borrowing, remaining: remainingBorrowing, pctLabel: '50% NAV', status: capacityStatus(remainingBorrowing, maxBorrowing) },
              { title: 'Employer Investments', limit: maxEmployer, used: totals.employer, remaining: remainingEmployer, pctLabel: '20% NAV', status: empStatus },
            ].map(c => (
              <div key={c.title} className="bg-gray-50 rounded-lg p-4 print:border print:border-gray-200 print:bg-white">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs font-semibold text-gray-600">{c.title}</p>
                  <StatusBadge status={c.status} />
                </div>
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between"><dt className="text-gray-500">Limit ({c.pctLabel})</dt><dd className="font-medium text-gray-700">{fmt(c.limit)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Used</dt><dd className="font-medium text-gray-700">{fmt(c.used)}</dd></div>
                  <div className="flex justify-between pt-1 border-t border-gray-200"><dt className="text-gray-500 font-semibold">Remaining</dt><dd className={`font-bold ${c.remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(c.remaining)}</dd></div>
                </dl>
                <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${c.remaining < 0 ? 'bg-red-500' : c.remaining < 0.1 * c.limit ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min((c.used / c.limit) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <BarChart categories={['Loanback', 'Borrowing', 'Employer Inv.']} series={barSeries} />
        </div>

        {/* Property & Loans Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Property Summary</h2>
            {properties.length === 0 ? (
              <p className="text-sm text-gray-400">No properties recorded.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Property', 'Address', 'Value'].map(h => <th key={h} className="text-left py-2 pr-3 text-gray-500 font-semibold uppercase tracking-wide">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {properties.map((p, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 font-medium text-gray-800">{p.property_name}</td>
                      <td className="py-2 pr-3 text-gray-500 truncate max-w-[100px]">{p.address || '—'}</td>
                      <td className="py-2 font-semibold text-gray-800">{fmt(Number(p.current_value))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td colSpan={2} className="py-2 font-semibold text-gray-700 text-xs">Total</td>
                    <td className="py-2 font-bold text-gray-900">{fmt(totals.property)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Loans Summary</h2>
            {loanbackRows.length === 0 && thirdPartyRows.length === 0 ? (
              <p className="text-sm text-gray-400">No loans recorded.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Borrower', 'Relationship', 'Outstanding'].map(h => <th key={h} className="text-left py-2 pr-3 text-gray-500 font-semibold uppercase tracking-wide">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loanbackRows.map((r, i) => (
                    <tr key={`lb-${i}`}>
                      <td className="py-2 pr-3 font-medium text-gray-800">{r.employer_name}</td>
                      <td className="py-2 pr-3"><span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-medium">Loanback</span></td>
                      <td className="py-2 font-semibold text-gray-800">{fmt(Number(r.outstanding_balance))}</td>
                    </tr>
                  ))}
                  {thirdPartyRows.map((r, i) => (
                    <tr key={`tp-${i}`}>
                      <td className="py-2 pr-3 font-medium text-gray-800">{r.borrower_name}</td>
                      <td className="py-2 pr-3"><span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 font-medium">Third Party</span></td>
                      <td className="py-2 font-semibold text-gray-800">{fmt(Number(r.outstanding_balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Cashflow & Liquidity */}
        {forecastRows.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Cashflow & Liquidity</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div className="bg-gray-50 rounded-lg p-4 print:border print:border-gray-200 print:bg-white">
                <p className="text-xs font-medium text-gray-500 mb-1">Lowest Projected Cash</p>
                <p className={`text-xl font-bold ${minCashflow < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmt(minCashflow)}</p>
                {minCashflow < 0 && <p className="text-xs text-red-600 mt-1">Projected cash deficit – review contributions, outflows or utilisation.</p>}
              </div>
              <div className="bg-gray-50 rounded-lg p-4 print:border print:border-gray-200 print:bg-white">
                <p className="text-xs font-medium text-gray-500 mb-1">Forecast End Cash ({forecastRows.length} months)</p>
                <p className={`text-xl font-bold ${finalCashflow < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmt(finalCashflow)}</p>
                <p className="text-xs text-gray-500 mt-1">{finalCashflow >= Number(scheme.cash_balance) ? 'Net positive cash build over forecast horizon.' : 'Net cash run-down over forecast horizon.'}</p>
              </div>
            </div>
            <LineChart
              labels={forecastRows.map(r => monthLabel(r.date))}
              series={[
                { name: 'Closing Cash', color: '#3b82f6', values: forecastRows.map(r => r.closing) },
                ...(cashflow && Number(cashflow.target_min_cash_buffer) > 0 ? [{ name: 'Min Buffer', color: '#ef4444', values: forecastRows.map(() => Number(cashflow!.target_min_cash_buffer)), dashed: true }] : []),
              ]}
            />
          </div>
        )}

        {/* Compliance Commentary */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Compliance Commentary</h2>
          <p className="text-xs text-gray-400 mb-2 no-print">Address loanback terms, borrowing purpose, and employer investment limits.</p>
          <textarea
            value={draft.compliance_commentary}
            onChange={e => set('compliance_commentary', e.target.value)}
            rows={6}
            placeholder="Loanbacks remain within 50% of NAV with security and terms compliant/non-compliant as follows..."
            className={`${textareaCls} no-print`}
          />
          <div className="hidden print:block text-sm text-gray-700 leading-relaxed whitespace-pre-wrap min-h-[80px] border border-gray-200 rounded-lg p-3">
            {draft.compliance_commentary || 'Commentary to be completed.'}
          </div>
        </div>

        {/* Trustee Sign-Off */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Trustee Sign-Off</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelCls}>Trustee Name</label>
              <input value={draft.trustee_name} onChange={e => set('trustee_name', e.target.value)} className={`${inputCls} no-print`} placeholder="Full name" />
              <p className="hidden print:block text-sm text-gray-700 border-b border-gray-300 pb-1 min-h-[28px]">{draft.trustee_name}</p>
            </div>
            <div>
              <label className={labelCls}>Sign-Off Date</label>
              <input type="date" value={draft.trustee_sign_off_date ?? ''} onChange={e => set('trustee_sign_off_date', e.target.value || null)} className={`${inputCls} no-print`} />
              <p className="hidden print:block text-sm text-gray-700 border-b border-gray-300 pb-1 min-h-[28px]">
                {draft.trustee_sign_off_date ? new Date(draft.trustee_sign_off_date).toLocaleDateString('en-GB') : ''}
              </p>
            </div>
            <div className="col-span-2">
              <label className={`${labelCls} print:hidden`}>Signature Block</label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm print:h-20">
                <span className="no-print">Signature area (printed version)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Print footer */}
        <div className="hidden print:block text-xs text-gray-400 text-center pt-4 border-t border-gray-200">
          Generated by Red Horizons SSAS Utilisation Planner — {new Date().toLocaleDateString('en-GB')} — Confidential
        </div>
      </div>
    </div>
  );
}
