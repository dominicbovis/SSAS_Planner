import { useEffect, useState, useCallback } from 'react';
import { Save, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, CashflowSettings } from '../types';
import LineChart from '../components/LineChart';
import CurrencyInput from '../components/CurrencyInput';
import { fmt } from '../lib/format';

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

const defaultSettings = (schemeId: string, cashBalance: number): Omit<CashflowSettings, 'id' | 'created_at' | 'updated_at'> => ({
  scheme_id: schemeId,
  forecast_start_date: new Date().toISOString().slice(0, 10),
  forecast_horizon_months: 12,
  opening_cash: cashBalance,
  include_scenario_adjustments: false,
  target_min_cash_buffer: 0,
  monthly_employer_contributions: 0,
  monthly_member_contributions: 0,
  monthly_rental_income: 0,
  monthly_loan_interest_received: 0,
  monthly_other_income: 0,
  monthly_loan_repayments_out: 0,
  monthly_borrowing_interest_paid: 0,
  monthly_property_expenses: 0,
  monthly_scheme_expenses: 0,
  monthly_benefit_payments: 0,
  monthly_other_outflows: 0,
});

interface Props { scheme: SsasScheme; }

interface ForecastRow {
  period: number;
  date: string;
  opening: number;
  inflows: number;
  outflows: number;
  net: number;
  closing: number;
}

export default function CashflowForecast({ scheme }: Props) {
  const [settings, setSettings] = useState<CashflowSettings | null>(null);
  const [draft, setDraft] = useState<Omit<CashflowSettings, 'id' | 'created_at' | 'updated_at'> | null>(null);
  const [saving, setSaving] = useState(false);
  const [scenarioNav, setScenarioNav] = useState(Number(scheme.net_asset_value));

  const load = useCallback(async () => {
    const { data } = await supabase.from('cashflow_settings').select('*').eq('scheme_id', scheme.id).maybeSingle();
    if (data) {
      setSettings(data);
      setDraft({ ...data });
    } else {
      const d = defaultSettings(scheme.id, Number(scheme.cash_balance));
      setDraft(d);
    }

    const { data: scData } = await supabase.from('scenarios').select('nav_adjustment_pct').eq('scheme_id', scheme.id).eq('is_active', true).maybeSingle();
    if (scData) {
      setScenarioNav(Number(scheme.net_asset_value) * (1 + Number(scData.nav_adjustment_pct) / 100));
    } else {
      setScenarioNav(Number(scheme.net_asset_value));
    }
  }, [scheme.id, scheme.cash_balance, scheme.net_asset_value]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    if (settings) {
      await supabase.from('cashflow_settings').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', settings.id);
    } else {
      const { data } = await supabase.from('cashflow_settings').insert(draft).select().single();
      if (data) setSettings(data);
    }
    setSaving(false);
  }

  const set = (f: keyof typeof draft, v: unknown) => setDraft(d => d ? { ...d, [f]: v } : d);

  if (!draft) return <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>;

  const baseNav = draft.include_scenario_adjustments ? scenarioNav : Number(scheme.net_asset_value);
  const totalInflows = draft.monthly_employer_contributions + draft.monthly_member_contributions + draft.monthly_rental_income + draft.monthly_loan_interest_received + draft.monthly_other_income;
  const totalOutflows = draft.monthly_loan_repayments_out + draft.monthly_borrowing_interest_paid + draft.monthly_property_expenses + draft.monthly_scheme_expenses + draft.monthly_benefit_payments + draft.monthly_other_outflows;
  const netMonthly = totalInflows - totalOutflows;
  const horizon = Math.max(1, Math.min(Number(draft.forecast_horizon_months), 120));

  const rows: ForecastRow[] = [];
  for (let n = 1; n <= horizon; n++) {
    const opening = n === 1 ? Number(draft.opening_cash) : rows[n - 2].closing;
    rows.push({
      period: n,
      date: addMonths(draft.forecast_start_date, n),
      opening,
      inflows: totalInflows,
      outflows: totalOutflows,
      net: netMonthly,
      closing: opening + netMonthly,
    });
  }

  const closingValues = rows.map(r => r.closing);
  const minClosing = Math.min(...closingValues);
  const maxClosing = Math.max(...closingValues);
  const finalClosing = rows[rows.length - 1]?.closing ?? Number(draft.opening_cash);
  const horizonNAV = baseNav + (finalClosing - Number(draft.opening_cash));

  const lineLabels = rows.map(r => monthLabel(r.date));
  const lineSeries = [
    { name: 'Closing Cash', color: '#3b82f6', values: closingValues },
    ...(draft.target_min_cash_buffer > 0 ? [{ name: 'Min Cash Buffer', color: '#ef4444', values: rows.map(() => Number(draft.target_min_cash_buffer)), dashed: true }] : []),
  ];

  const inputCls = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cashflow Forecast</h1>
          <p className="text-sm text-gray-500 mt-0.5">Project cash position over the forecast horizon</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
          <Save size={14} />{saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* Forecast Settings */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Forecast Settings</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <div>
            <label className={labelCls}>Forecast Start Date</label>
            <input type="date" value={draft.forecast_start_date} onChange={e => set('forecast_start_date', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Horizon (Months)</label>
            <input type="number" min={1} max={120} value={draft.forecast_horizon_months} onChange={e => set('forecast_horizon_months', parseInt(e.target.value) || 12)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Opening Cash</label>
            <CurrencyInput value={draft.opening_cash} onChange={v => set('opening_cash', v)} />
          </div>
          <div>
            <label className={labelCls}>Min Cash Buffer</label>
            <CurrencyInput value={draft.target_min_cash_buffer} onChange={v => set('target_min_cash_buffer', v)} />
          </div>
          <div className="col-span-2 md:col-span-4 flex items-center gap-3">
            <input
              type="checkbox"
              id="scenario_adj"
              checked={draft.include_scenario_adjustments}
              onChange={e => set('include_scenario_adjustments', e.target.checked)}
              className="w-4 h-4 accent-red-600"
            />
            <label htmlFor="scenario_adj" className="text-sm text-gray-700">
              Use Scenario NAV in HMRC horizon check
              {draft.include_scenario_adjustments && <span className="ml-2 text-xs text-gray-500">(Scenario NAV: {fmt(scenarioNav)})</span>}
            </label>
          </div>
        </div>
      </div>

      {/* Inflows / Outflows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Monthly Inflows</h2>
          <div className="space-y-3">
            {[
              { label: 'Employer Contributions', field: 'monthly_employer_contributions' },
              { label: 'Member Contributions', field: 'monthly_member_contributions' },
              { label: 'Rental Income', field: 'monthly_rental_income' },
              { label: 'Loan Interest Received', field: 'monthly_loan_interest_received' },
              { label: 'Other Income', field: 'monthly_other_income' },
            ].map(({ label, field }) => (
              <div key={field} className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-48 shrink-0">{label}</label>
                <CurrencyInput
                  value={Number((draft as Record<string, unknown>)[field])}
                  onChange={v => set(field as keyof typeof draft, v)}
                />
              </div>
            ))}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Total Monthly Inflows</span>
              <span className="text-sm font-bold text-emerald-600">{fmt(totalInflows)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Monthly Outflows</h2>
          <div className="space-y-3">
            {[
              { label: 'Loan Repayments', field: 'monthly_loan_repayments_out' },
              { label: 'Borrowing Interest', field: 'monthly_borrowing_interest_paid' },
              { label: 'Property Expenses', field: 'monthly_property_expenses' },
              { label: 'Scheme Expenses', field: 'monthly_scheme_expenses' },
              { label: 'Benefit Payments', field: 'monthly_benefit_payments' },
              { label: 'Other Outflows', field: 'monthly_other_outflows' },
            ].map(({ label, field }) => (
              <div key={field} className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-48 shrink-0">{label}</label>
                <CurrencyInput
                  value={Number((draft as Record<string, unknown>)[field])}
                  onChange={v => set(field as keyof typeof draft, v)}
                />
              </div>
            ))}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Total Monthly Outflows</span>
              <span className="text-sm font-bold text-red-600">{fmt(totalOutflows)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Net cashflow summary */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            {netMonthly >= 0 ? <TrendingUp size={18} className="text-emerald-500" /> : <TrendingDown size={18} className="text-red-500" />}
            <div>
              <p className="text-xs text-gray-500">Net Monthly Cashflow</p>
              <p className={`text-lg font-bold ${netMonthly >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(netMonthly)}</p>
            </div>
          </div>
          <div className="h-10 border-l border-gray-200" />
          <div>
            <p className="text-xs text-gray-500">Projected at {horizon} months</p>
            <p className={`text-lg font-bold ${finalClosing >= 0 ? 'text-gray-800' : 'text-red-600'}`}>{fmt(finalClosing)}</p>
          </div>
          <div className="h-10 border-l border-gray-200" />
          <div>
            <p className="text-xs text-gray-500">Lowest projected cash</p>
            <p className={`text-lg font-bold ${minClosing < 0 ? 'text-red-600' : minClosing < Number(draft.target_min_cash_buffer) ? 'text-amber-600' : 'text-gray-800'}`}>{fmt(minClosing)}</p>
          </div>
        </div>
      </div>

      {/* Line chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Projected Cash Balance</h2>
        <LineChart labels={lineLabels} series={lineSeries} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Lowest Projected Cash</h3>
          <p className={`text-2xl font-bold mb-2 ${minClosing < 0 ? 'text-red-600' : minClosing < Number(draft.target_min_cash_buffer) ? 'text-amber-600' : 'text-emerald-600'}`}>{fmt(minClosing)}</p>
          {minClosing < 0 ? (
            <div className="flex items-start gap-2 p-2 bg-red-50 rounded-lg text-xs text-red-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              Projected cash deficit – review contributions, outflows or utilisation.
            </div>
          ) : minClosing < Number(draft.target_min_cash_buffer) ? (
            <div className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg text-xs text-amber-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              Below target buffer in at least one period.
            </div>
          ) : (
            <p className="text-xs text-emerald-600">Cash remains above target buffer throughout.</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Forecast vs Current Cash</h3>
          <p className="text-xs text-gray-500 mb-1">Current: {fmt(Number(scheme.cash_balance))}</p>
          <p className="text-xs text-gray-500 mb-2">Forecast end: {fmt(finalClosing)}</p>
          <p className={`text-2xl font-bold mb-2 ${finalClosing - Number(scheme.cash_balance) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {finalClosing - Number(scheme.cash_balance) >= 0 ? '+' : ''}{fmt(finalClosing - Number(scheme.cash_balance))}
          </p>
          <p className="text-xs text-gray-500">
            {finalClosing > Number(scheme.cash_balance) ? 'Net positive cash build over forecast horizon.' : 'Net cash run-down over forecast horizon.'}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Indicative Capacity at Horizon</h3>
          <p className="text-xs text-gray-500 mb-1">Horizon NAV (est.): {fmt(horizonNAV)}</p>
          <p className="text-xs text-gray-500 mb-1">Max Loanback (50%): {fmt(0.5 * horizonNAV)}</p>
          <p className="text-xs text-gray-500 mb-3">Max Borrowing (50%): {fmt(0.5 * horizonNAV)}</p>
          <p className="text-xs text-gray-400 italic">Indicative HMRC 50% limits recalculated at forecast horizon using projected cash-adjusted NAV.</p>
        </div>
      </div>

      {/* Cashflow table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Cashflow Forecast Table</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Period', 'Period End', 'Opening Cash', 'Total Inflows', 'Total Outflows', 'Net Cashflow', 'Closing Cash'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => {
                const belowBuffer = draft.target_min_cash_buffer > 0 && r.closing < Number(draft.target_min_cash_buffer);
                return (
                  <tr key={r.period} className={`hover:bg-gray-50 transition-colors ${r.closing < 0 ? 'bg-red-50' : belowBuffer ? 'bg-amber-50' : ''}`}>
                    <td className="px-5 py-2.5 text-gray-500 font-medium">{r.period}</td>
                    <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{r.date}</td>
                    <td className="px-5 py-2.5 text-gray-700">{fmt(r.opening)}</td>
                    <td className="px-5 py-2.5 text-emerald-700">{fmt(r.inflows)}</td>
                    <td className="px-5 py-2.5 text-red-700">{fmt(r.outflows)}</td>
                    <td className={`px-5 py-2.5 font-medium ${r.net < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(r.net)}</td>
                    <td className={`px-5 py-2.5 font-bold ${r.closing < 0 ? 'text-red-700' : belowBuffer ? 'text-amber-700' : 'text-gray-800'}`}>{fmt(r.closing)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {maxClosing !== minClosing && (
          <div className="px-6 py-3 border-t border-gray-100 flex gap-6 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-100 inline-block" /> Cash deficit</span>
            {draft.target_min_cash_buffer > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-100 inline-block" /> Below min buffer</span>}
          </div>
        )}
      </div>
    </div>
  );
}
