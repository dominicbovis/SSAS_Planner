import { useEffect, useState } from 'react';
import { Printer, Save, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, TermLenderPackSettings } from '../types';
import StatusBadge from '../components/StatusBadge';

import CurrencyInput from '../components/CurrencyInput';
import { fmt, fmtFull } from '../lib/format';

function pctFmt(v: number) { return `${v.toFixed(2)}%`; }

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white';
const labelCls = 'block text-xs font-medium text-gray-500 mb-1';

function dscrStatus(dscr: number): 'OK' | 'Warning' | 'Breach' {
  if (dscr >= 1.25) return 'OK';
  if (dscr >= 1.0) return 'Warning';
  return 'Breach';
}

function dscrLabel(dscr: number): string {
  if (dscr >= 1.25) return 'Strong coverage';
  if (dscr >= 1.0) return 'Tight coverage';
  return 'Below coverage';
}

function inlineInput(
  val: string | number,
  onChange: (v: string) => void,
  type: 'text' | 'number' | 'date' = 'text',
  extraCls = ''
) {
  return (
    <>
      <input
        type={type}
        value={val}
        onChange={e => onChange(e.target.value)}
        className={`${inputCls} no-print ${extraCls}`}
      />
      <span className="hidden print:block text-sm">{val}</span>
    </>
  );
}

function numInput(
  val: number,
  onChange: (v: number) => void,
  step = 1,
  extraCls = ''
) {
  return (
    <>
      <input
        type="number"
        value={val}
        step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className={`${inputCls} no-print ${extraCls}`}
      />
      <span className="hidden print:block text-sm">{val}</span>
    </>
  );
}

const defaultSettings = (schemeId: string): Omit<TermLenderPackSettings, 'id' | 'created_at' | 'updated_at'> => ({
  scheme_id: schemeId,
  title: 'SSAS Term Lender Pack',
  report_date: new Date().toISOString().slice(0, 10),
  prepared_by: '',
  requested_term_loan_amount: 0,
  requested_term_years: 5,
  proposed_margin: 3.5,
  amortisation_profile: 'Interest Only',
  stabilised_rental_income: 0,
  stabilised_loan_interest_received: 0,
  stabilised_property_expenses: 0,
  stabilised_scheme_expenses: 0,
  annual_capital_repayment: 0,
  noi_downside_pct: -10,
  rate_up_pct: 2,
});

interface Props {
  scheme: SsasScheme;
}

export default function LenderPackTerm({ scheme }: Props) {
  const [settings, setSettings] = useState<TermLenderPackSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [scheme.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('term_lender_pack_settings')
      .select('*')
      .eq('scheme_id', scheme.id)
      .maybeSingle();
    setSettings(data ?? { id: '', created_at: '', updated_at: '', ...defaultSettings(scheme.id) });
    setLoading(false);
  }

  function patch(partial: Partial<TermLenderPackSettings>) {
    setSettings(prev => prev ? { ...prev, ...partial } : prev);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    const payload = {
      scheme_id: settings.scheme_id,
      title: settings.title,
      report_date: settings.report_date,
      prepared_by: settings.prepared_by,
      requested_term_loan_amount: settings.requested_term_loan_amount,
      requested_term_years: settings.requested_term_years,
      proposed_margin: settings.proposed_margin,
      amortisation_profile: settings.amortisation_profile,
      stabilised_rental_income: settings.stabilised_rental_income,
      stabilised_loan_interest_received: settings.stabilised_loan_interest_received,
      stabilised_property_expenses: settings.stabilised_property_expenses,
      stabilised_scheme_expenses: settings.stabilised_scheme_expenses,
      annual_capital_repayment: settings.annual_capital_repayment,
      noi_downside_pct: settings.noi_downside_pct,
      rate_up_pct: settings.rate_up_pct,
    };
    if (settings.id) {
      await supabase.from('term_lender_pack_settings').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', settings.id);
    } else {
      const { data } = await supabase.from('term_lender_pack_settings').insert(payload).select().maybeSingle();
      if (data) setSettings(data);
    }
    setSaving(false);
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  // Derived calculations
  const stabilisedNOI =
    settings.stabilised_rental_income +
    settings.stabilised_loan_interest_received -
    settings.stabilised_property_expenses -
    settings.stabilised_scheme_expenses;

  const annualInterestCost = (settings.proposed_margin / 100) * settings.requested_term_loan_amount;
  const totalDebtService = annualInterestCost + settings.annual_capital_repayment;
  const baseDscr = totalDebtService > 0 ? stabilisedNOI / totalDebtService : 0;

  // NOI downside scenario
  const noiDownAmt = stabilisedNOI * (1 + settings.noi_downside_pct / 100);
  const noiDownDscr = totalDebtService > 0 ? noiDownAmt / totalDebtService : 0;

  // Rate up scenario
  const rateUpInterest = ((settings.proposed_margin + settings.rate_up_pct) / 100) * settings.requested_term_loan_amount;
  const rateUpDebtService = rateUpInterest + settings.annual_capital_repayment;
  const rateUpDscr = rateUpDebtService > 0 ? stabilisedNOI / rateUpDebtService : 0;

  // Combined stress
  const combinedDscr = rateUpDebtService > 0 ? noiDownAmt / rateUpDebtService : 0;

  const sensitivityRows = [
    { label: 'Base Case', noi: stabilisedNOI, debtService: totalDebtService, dscr: baseDscr },
    { label: `NOI Downside (${settings.noi_downside_pct}%)`, noi: noiDownAmt, debtService: totalDebtService, dscr: noiDownDscr },
    { label: `Rate Up (+${settings.rate_up_pct}%)`, noi: stabilisedNOI, debtService: rateUpDebtService, dscr: rateUpDscr },
    { label: 'Combined Stress', noi: noiDownAmt, debtService: rateUpDebtService, dscr: combinedDscr },
  ];

  const dscrBarPct = (dscr: number) => Math.min((dscr / 2.5) * 100, 100);
  const dscrBarColor = (dscr: number) => dscr >= 1.25 ? 'bg-emerald-500' : dscr >= 1.0 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      {/* Toolbar */}
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lender Pack — Term</h1>
          <p className="text-sm text-gray-500 mt-0.5">{scheme.name}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <div className="text-xs text-gray-500 uppercase tracking-widest">Red Horizons SSAS</div>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">{settings.title}</h1>
        <div className="text-sm text-gray-600 mt-1">{scheme.name} &middot; {settings.report_date} &middot; Prepared by: {settings.prepared_by || '—'}</div>
        <hr className="mt-3 border-gray-300" />
      </div>

      {/* Header Section */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Pack Header</h2>
        </div>
        <div className="p-6 grid grid-cols-2 gap-6 md:grid-cols-4">
          <div className="col-span-2">
            <label className={labelCls}>Pack Title</label>
            {inlineInput(settings.title, v => patch({ title: v }))}
          </div>
          <div>
            <label className={labelCls}>Report Date</label>
            {inlineInput(settings.report_date, v => patch({ report_date: v }), 'date')}
          </div>
          <div>
            <label className={labelCls}>Prepared By</label>
            {inlineInput(settings.prepared_by, v => patch({ prepared_by: v }))}
          </div>
        </div>
      </section>

      {/* Loan Request Summary */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Loan Request Summary</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <div>
              <label className={labelCls}>Loan Amount Requested</label>
              <CurrencyInput value={settings.requested_term_loan_amount} onChange={v => patch({ requested_term_loan_amount: v })} className="no-print" />
              <span className="hidden print:block text-sm">{fmt(settings.requested_term_loan_amount)}</span>
            </div>
            <div>
              <label className={labelCls}>Term (Years)</label>
              {numInput(settings.requested_term_years, v => patch({ requested_term_years: v }), 1)}
            </div>
            <div>
              <label className={labelCls}>Proposed Margin (% p.a.)</label>
              {numInput(settings.proposed_margin, v => patch({ proposed_margin: v }), 0.1)}
            </div>
            <div>
              <label className={labelCls}>Amortisation Profile</label>
              <>
                <select
                  value={settings.amortisation_profile}
                  onChange={e => patch({ amortisation_profile: e.target.value })}
                  className={`${inputCls} no-print`}
                >
                  <option>Interest Only</option>
                  <option>Capital &amp; Interest</option>
                  <option>Partial Amortisation</option>
                  <option>Bullet</option>
                </select>
                <span className="hidden print:block text-sm">{settings.amortisation_profile}</span>
              </>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <div className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-1">Loan Amount</div>
              <div className="text-2xl font-bold text-blue-900">{fmt(settings.requested_term_loan_amount)}</div>
              <div className="text-xs text-blue-600 mt-1">Requested principal</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Loan Term</div>
              <div className="text-2xl font-bold text-gray-900">{settings.requested_term_years} yrs</div>
              <div className="text-xs text-gray-500 mt-1">{settings.amortisation_profile}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Proposed Rate</div>
              <div className="text-2xl font-bold text-gray-900">{pctFmt(settings.proposed_margin)}</div>
              <div className="text-xs text-gray-500 mt-1">Annual interest margin</div>
            </div>
          </div>
        </div>
      </section>

      {/* Income & DSCR Section */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Stabilised Income &amp; DSCR</h2>
        </div>
        <div className="p-6 space-y-6">
          {/* Income inputs */}
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <div>
              <label className={labelCls}>Stabilised Rental Income (p.a.)</label>
              <CurrencyInput value={settings.stabilised_rental_income} onChange={v => patch({ stabilised_rental_income: v })} className="no-print" />
              <span className="hidden print:block text-sm">{fmt(settings.stabilised_rental_income)}</span>
            </div>
            <div>
              <label className={labelCls}>Loan Interest Received (p.a.)</label>
              <CurrencyInput value={settings.stabilised_loan_interest_received} onChange={v => patch({ stabilised_loan_interest_received: v })} className="no-print" />
              <span className="hidden print:block text-sm">{fmt(settings.stabilised_loan_interest_received)}</span>
            </div>
            <div>
              <label className={labelCls}>Property Expenses (p.a.)</label>
              <CurrencyInput value={settings.stabilised_property_expenses} onChange={v => patch({ stabilised_property_expenses: v })} className="no-print" />
              <span className="hidden print:block text-sm">{fmt(settings.stabilised_property_expenses)}</span>
            </div>
            <div>
              <label className={labelCls}>Scheme Expenses (p.a.)</label>
              <CurrencyInput value={settings.stabilised_scheme_expenses} onChange={v => patch({ stabilised_scheme_expenses: v })} className="no-print" />
              <span className="hidden print:block text-sm">{fmt(settings.stabilised_scheme_expenses)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
            <div>
              <label className={labelCls}>Annual Capital Repayment</label>
              <CurrencyInput value={settings.annual_capital_repayment} onChange={v => patch({ annual_capital_repayment: v })} className="no-print" />
              <span className="hidden print:block text-sm">{fmt(settings.annual_capital_repayment)}</span>
            </div>
          </div>

          {/* Computed DSCR breakdown */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">DSCR Computation</h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 text-sm">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Gross Income</div>
                <div className="font-semibold text-gray-900">
                  {fmtFull(settings.stabilised_rental_income + settings.stabilised_loan_interest_received)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Less: Expenses</div>
                <div className="font-semibold text-red-700">
                  ({fmtFull(settings.stabilised_property_expenses + settings.stabilised_scheme_expenses)})
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Net Operating Income</div>
                <div className={`font-bold text-base ${stabilisedNOI >= 0 ? 'text-gray-900' : 'text-red-700'}`}>
                  {fmtFull(stabilisedNOI)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Total Debt Service</div>
                <div className="font-semibold text-gray-900">{fmtFull(totalDebtService)}</div>
                <div className="text-xs text-gray-400">
                  Interest {fmtFull(annualInterestCost)} + Capital {fmtFull(settings.annual_capital_repayment)}
                </div>
              </div>
            </div>

            {/* DSCR Result */}
            <div className="flex items-center gap-4 pt-2 border-t border-gray-200">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Base DSCR</div>
                <div className={`text-3xl font-bold ${baseDscr >= 1.25 ? 'text-emerald-700' : baseDscr >= 1.0 ? 'text-amber-700' : 'text-red-700'}`}>
                  {totalDebtService > 0 ? baseDscr.toFixed(2) : '—'}x
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <StatusBadge status={dscrStatus(baseDscr)} />
                <span className="text-xs text-gray-500">{dscrLabel(baseDscr)}</span>
              </div>
              <div className="flex-1 text-xs text-gray-400 italic ml-4">
                DSCR = Stabilised NOI ÷ Annual Debt Service
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DSCR Sensitivity */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">DSCR Sensitivity Analysis</h2>
          <div className="no-print flex gap-4 items-center text-sm">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">NOI Downside (%)</label>
              <input
                type="number"
                value={settings.noi_downside_pct}
                step={1}
                onChange={e => patch({ noi_downside_pct: parseFloat(e.target.value) || 0 })}
                className="w-24 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">Rate Up (%)</label>
              <input
                type="number"
                value={settings.rate_up_pct}
                step={0.25}
                onChange={e => patch({ rate_up_pct: parseFloat(e.target.value) || 0 })}
                className="w-24 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="hidden print:flex gap-4 text-xs text-gray-500 mb-2">
            <span>NOI Downside: {settings.noi_downside_pct}%</span>
            <span>Rate Up: +{settings.rate_up_pct}%</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-600">Scenario</th>
                <th className="text-right py-2 font-medium text-gray-600">Stabilised NOI</th>
                <th className="text-right py-2 font-medium text-gray-600">Debt Service</th>
                <th className="text-right py-2 font-medium text-gray-600">DSCR</th>
                <th className="text-left py-2 font-medium text-gray-600 pl-4 no-print">Coverage</th>
                <th className="text-left py-2 font-medium text-gray-600 pl-4 hidden print:table-cell">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sensitivityRows.map((row, i) => (
                <tr key={i} className={i === 0 ? 'bg-gray-50' : ''}>
                  <td className="py-3 font-medium text-gray-800">{row.label}</td>
                  <td className="py-3 text-right text-gray-700">{fmtFull(row.noi)}</td>
                  <td className="py-3 text-right text-gray-700">{fmtFull(row.debtService)}</td>
                  <td className={`py-3 text-right font-bold ${row.dscr >= 1.25 ? 'text-emerald-700' : row.dscr >= 1.0 ? 'text-amber-700' : 'text-red-700'}`}>
                    {row.debtService > 0 ? row.dscr.toFixed(2) : '—'}x
                  </td>
                  <td className="py-3 pl-4 no-print">
                    <div className="flex items-center gap-2">
                      <div className="w-28 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full ${dscrBarColor(row.dscr)} transition-all`}
                          style={{ width: `${dscrBarPct(row.dscr)}%` }}
                        />
                      </div>
                      <StatusBadge status={dscrStatus(row.dscr)} />
                    </div>
                  </td>
                  <td className="py-3 pl-4 hidden print:table-cell">
                    <StatusBadge status={dscrStatus(row.dscr)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Threshold legend */}
          <div className="flex gap-6 text-xs text-gray-500 pt-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-emerald-500"></span>
              <span>Strong coverage (&ge;1.25x)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-amber-500"></span>
              <span>Tight coverage (1.00x – 1.25x)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span>
              <span>Below coverage (&lt;1.00x)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Print footer */}
      <div className="hidden print:block text-xs text-gray-400 text-center pt-4 border-t border-gray-200">
        Red Horizons SSAS Utilisation Planner &mdash; Confidential &mdash; {settings.report_date}
      </div>
    </div>
  );
}
