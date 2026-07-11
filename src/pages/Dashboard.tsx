import { useEffect, useState, useRef } from 'react';
import { Save, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, ScenarioRecord, ScenarioAction, PendingTransfer } from '../types';
import GaugeChart from '../components/GaugeChart';
import PieChart from '../components/PieChart';
import StatusBadge from '../components/StatusBadge';
import CurrencyInput from '../components/CurrencyInput';
import { fmt, fmtFull } from '../lib/format';

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

interface Totals {
  property: number;
  loanbacks: number;
  thirdParty: number;
  borrowing: number;
  employer: number;
  funds: number;
  computedNav: number;
}


interface DashboardProps {
  scheme: SsasScheme;
  onSchemeUpdate: (s: SsasScheme) => void;
}

function CashInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(value === 0 ? '' : String(value));
  const committed = useRef(value);

  useEffect(() => {
    if (value !== committed.current) {
      setText(value === 0 ? '' : String(value));
      committed.current = value;
    }
  }, [value]);

  function handleBlur() {
    const raw = text.replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(raw);
    const next = isNaN(parsed) ? 0 : parsed;
    committed.current = next;
    setText(next === 0 ? '' : String(next));
    onCommit(next);
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none select-none">£</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={handleBlur}
        placeholder="0"
        className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[180px]"
      />
    </div>
  );
}

function bankTotal(edit: Partial<SsasScheme>, scheme: SsasScheme): number {
  const get = (k: keyof SsasScheme) => Number((edit as Record<string, unknown>)[k as string] ?? scheme[k] ?? 0);
  return get('metro_bank_balance') + get('cater_allen_balance') + get('utb_balance');
}

function gaugeColor(value: number, max: number, warnThreshold = 0.9): 'red' | 'amber' | 'green' {
  if (value > max) return 'red';
  if (value > max * warnThreshold) return 'amber';
  return 'green';
}

function capacityStatus(remaining: number, max: number): 'OK' | 'Warning' | 'Breach' {
  if (remaining < 0) return 'Breach';
  if (remaining < 0.1 * max) return 'Warning';
  return 'OK';
}

export default function Dashboard({ scheme, onSchemeUpdate }: DashboardProps) {
  const [totals, setTotals] = useState<Totals>({ property: 0, loanbacks: 0, thirdParty: 0, borrowing: 0, employer: 0, funds: 0, computedNav: 0 });
  const [editing, setEditing] = useState<Partial<SsasScheme>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [perEmployerBreach, setPerEmployerBreach] = useState(false);
  const [activeScenario, setActiveScenario] = useState<ScenarioRecord | null>(null);
  const [scenarioActions, setScenarioActions] = useState<ScenarioAction[]>([]);
  const [scenarioTransfers, setScenarioTransfers] = useState<PendingTransfer[]>([]);
  const [includeScenario, setIncludeScenario] = useState(false);

  useEffect(() => {
    loadTotals();
    loadActiveScenario();
  }, [scheme.id]);

  async function loadActiveScenario() {
    const { data: sc } = await supabase
      .from('scenarios')
      .select('*')
      .eq('scheme_id', scheme.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!sc) {
      setActiveScenario(null);
      setScenarioActions([]);
      setScenarioTransfers([]);
      return;
    }
    setActiveScenario(sc as ScenarioRecord);
    const [acts, trans] = await Promise.all([
      supabase.from('scenario_actions').select('*').eq('scenario_id', sc.id).order('created_at'),
      supabase.from('pending_transfers').select('*').eq('scenario_id', sc.id).order('expected_date'),
    ]);
    setScenarioActions((acts.data ?? []) as ScenarioAction[]);
    setScenarioTransfers((trans.data ?? []) as PendingTransfer[]);
  }

  async function loadTotals() {
    setLoading(true);
    const [prop, lb, tp, borrow, emp, manAssets, manLiabilities, funds] = await Promise.all([
      supabase.from('property_register').select('current_value').eq('scheme_id', scheme.id),
      supabase.from('loanback_register').select('outstanding_balance').eq('scheme_id', scheme.id),
      supabase.from('third_party_loans').select('outstanding_balance').eq('scheme_id', scheme.id),
      supabase.from('borrowing_register').select('outstanding_balance').eq('scheme_id', scheme.id),
      supabase.from('employer_related_investments').select('employer_name, amount').eq('scheme_id', scheme.id),
      supabase.from('nav_assets').select('market_value').eq('scheme_id', scheme.id),
      supabase.from('nav_liabilities').select('amount').eq('scheme_id', scheme.id),
      supabase.from('fund_investments').select('current_value').eq('scheme_id', scheme.id),
    ]);

    const property = (prop.data ?? []).reduce((s, r) => s + Number(r.current_value), 0);
    const loanbacks = (lb.data ?? []).reduce((s, r) => s + Number(r.outstanding_balance), 0);
    const thirdParty = (tp.data ?? []).reduce((s, r) => s + Number(r.outstanding_balance), 0);
    const borrowing = (borrow.data ?? []).reduce((s, r) => s + Number(r.outstanding_balance), 0);
    const empData = emp.data ?? [];
    const employer = empData.reduce((s, r) => s + Number(r.amount), 0);
    const fundsTotal = (funds.data ?? []).reduce((s, r) => s + Number(r.current_value), 0);

    const cash = Number(scheme.metro_bank_balance) + Number(scheme.cater_allen_balance) + Number(scheme.utb_balance);
    const totalAssets = cash + property + loanbacks + thirdParty + employer + fundsTotal
      + (manAssets.data ?? []).reduce((s, r) => s + Number(r.market_value), 0);
    const totalLiabilities = borrowing
      + (manLiabilities.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const computedNav = totalAssets - totalLiabilities;

    const perEmpLimit = 0.05 * computedNav;
    const grouped: Record<string, number> = {};
    empData.forEach(r => { grouped[r.employer_name] = (grouped[r.employer_name] ?? 0) + Number(r.amount); });
    setPerEmployerBreach(Object.values(grouped).some(v => v > perEmpLimit));
    setTotals({ property, loanbacks, thirdParty, borrowing, employer, funds: fundsTotal, computedNav });
    setLoading(false);
  }

  const nav = totals.computedNav;
  const baseCash = Number(scheme.metro_bank_balance) + Number(scheme.cater_allen_balance) + Number(scheme.utb_balance);

  // Compute scenario adjustments (cash + NAV delta from actions and pending transfers)
  let scenarioCashDelta = 0;
  let scenarioNavDelta = 0;
  if (activeScenario) {
    for (const a of scenarioActions) {
      const amt = Number(a.amount);
      switch (a.action_type) {
        case 'cash_in': scenarioCashDelta += amt; scenarioNavDelta += amt; break;
        case 'cash_out': scenarioCashDelta -= amt; scenarioNavDelta -= amt; break;
        case 'property_purchase': scenarioNavDelta += amt; scenarioCashDelta -= amt; break;
        case 'loanback': scenarioCashDelta -= amt; break;
        case 'repay_loanback': scenarioCashDelta += amt; break;
        case 'borrow': scenarioCashDelta += amt; break;
        case 'repay_borrowing': scenarioCashDelta -= amt; break;
        case 'employer_investment': scenarioCashDelta -= amt; break;
      }
    }
    for (const t of scenarioTransfers) {
      const amt = Number(t.amount);
      scenarioCashDelta += amt;
      scenarioNavDelta += amt;
    }
  }

  const cash = includeScenario ? baseCash + scenarioCashDelta : baseCash;
  const displayNav = includeScenario ? nav + scenarioNavDelta : nav;

  const maxLoanback = 0.5 * displayNav;
  const maxBorrowing = 0.5 * displayNav;
  const maxEmployer = 0.20 * displayNav;

  const remainingLoanback = maxLoanback - totals.loanbacks;
  const remainingBorrowing = maxBorrowing - totals.borrowing;
  const remainingEmployer = maxEmployer - totals.employer;

  const utilTable = [
    { type: 'Commercial Property', amount: totals.property, limit: 'No HMRC limit', remaining: 'N/A', status: 'OK' },
    { type: 'Loanbacks', amount: totals.loanbacks, limit: fmt(maxLoanback), remaining: fmt(remainingLoanback), status: capacityStatus(remainingLoanback, maxLoanback) },
    { type: 'Third-Party Loans', amount: totals.thirdParty, limit: 'N/A', remaining: 'N/A', status: 'OK' },
    { type: 'Fund Investments', amount: totals.funds, limit: 'No specific limit', remaining: 'N/A', status: 'OK' },
    { type: 'Borrowing', amount: totals.borrowing, limit: fmt(maxBorrowing), remaining: fmt(remainingBorrowing), status: capacityStatus(remainingBorrowing, maxBorrowing) },
    { type: 'Employer Investments', amount: totals.employer, limit: fmt(maxEmployer), remaining: fmt(remainingEmployer), status: capacityStatus(remainingEmployer, maxEmployer) },
  ];

  const pieSlices = [
    { label: 'Cash', value: cash, color: PIE_COLORS[0] },
    { label: 'Commercial Property', value: totals.property, color: PIE_COLORS[1] },
    { label: 'Loanbacks', value: totals.loanbacks, color: PIE_COLORS[2] },
    { label: 'Third-Party Loans', value: totals.thirdParty, color: PIE_COLORS[3] },
    { label: 'Fund Investments', value: totals.funds, color: PIE_COLORS[6] },
    { label: 'Borrowing', value: totals.borrowing, color: PIE_COLORS[4] },
    { label: 'Employer Investments', value: totals.employer, color: PIE_COLORS[5] },
  ];


  const handleSave = async () => {
    setSaving(true);
    const { data } = await supabase
      .from('ssas_schemes')
      .update({ ...editing, updated_at: new Date().toISOString() })
      .eq('id', scheme.id)
      .select()
      .single();
    if (data) onSchemeUpdate(data);
    setEditing({});
    setSaving(false);
    loadTotals();
  };

  const schemeVal = (field: keyof SsasScheme) => (editing as Record<string, unknown>)[field as string] ?? scheme[field];
  const isDirty = Object.keys(editing).length > 0;

  const empStatus = perEmployerBreach
    ? 'Per-employer breach'
    : remainingEmployer < 0
    ? 'Aggregate breach'
    : 'OK';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">SSAS overview and HMRC utilisation summary</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadTotals}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
            >
              <Save size={14} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* SSAS Overview Card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">SSAS Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <div className="col-span-2 md:col-span-1 space-y-1">
            <label className="text-xs text-gray-500 font-medium">Scheme Name</label>
            <input
              value={String(schemeVal('name'))}
              onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">Snapshot Date</label>
            <input
              type="date"
              value={String(schemeVal('snapshot_date'))}
              onChange={e => setEditing(p => ({ ...p, snapshot_date: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">Net Asset Value</label>
            <div className="w-full text-sm border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 font-semibold text-gray-900 select-none">
              {loading ? '—' : fmtFull(displayNav)}
            </div>
            <p className="text-[10px] text-gray-400 leading-tight">Auto-calculated from NAV Tracker</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">Metro Bank</label>
            <CashInput
              value={Number(schemeVal('metro_bank_balance'))}
              onCommit={v => setEditing(p => {
                const next = { ...p, metro_bank_balance: v };
                next.cash_balance = bankTotal(next, scheme);
                return next;
              })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">Cater Allen</label>
            <CashInput
              value={Number(schemeVal('cater_allen_balance'))}
              onCommit={v => setEditing(p => {
                const next = { ...p, cater_allen_balance: v };
                next.cash_balance = bankTotal(next, scheme);
                return next;
              })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">UTB</label>
            <CashInput
              value={Number(schemeVal('utb_balance'))}
              onCommit={v => setEditing(p => {
                const next = { ...p, utb_balance: v };
                next.cash_balance = bankTotal(next, scheme);
                return next;
              })}
            />
          </div>
        </div>

        {/* Cash balance total */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <span className="text-xs text-gray-500 font-medium">Total Cash Balance:</span>
          <span className="text-sm font-bold text-gray-900">{fmtFull(Number(schemeVal('cash_balance')))}</span>
        </div>

        {/* Active scenario toggle */}
        {activeScenario && (
          <div className="mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50/60">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Active Scenario</span>
                  <span className="text-sm font-medium text-gray-800 truncate">{activeScenario.scenario_name}</span>
                </div>
                <p className="text-xs text-amber-700 mt-0.5">
                  {includeScenario
                    ? `Included in calculations: cash ${scenarioCashDelta >= 0 ? '+' : ''}${fmtFull(scenarioCashDelta)}, NAV ${scenarioNavDelta >= 0 ? '+' : ''}${fmtFull(scenarioNavDelta)}`
                    : 'Excluded from calculations. Toggle to include scenario adjustments.'}
                </p>
              </div>
              <button
                onClick={() => setIncludeScenario(prev => !prev)}
                className="flex items-center gap-1.5 shrink-0"
                title={includeScenario ? 'Exclude scenario from calculations' : 'Include scenario in calculations'}
              >
                {includeScenario
                  ? <ToggleRight size={36} className="text-amber-600" />
                  : <ToggleLeft size={36} className="text-gray-400" />}
                <span className={`text-xs font-semibold ${includeScenario ? 'text-amber-700' : 'text-gray-500'}`}>
                  {includeScenario ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Read-only totals */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-gray-100">
          {[
            { label: 'Commercial Property', value: totals.property },
            { label: 'Total Loanbacks', value: totals.loanbacks },
            { label: 'Third-Party Loans', value: totals.thirdParty },
            { label: 'Borrowing', value: totals.borrowing },
          ].map(({ label, value }) => (
            <div key={label} className="space-y-0.5">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-base font-semibold text-gray-800">{fmtFull(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Charts + Gauges Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Asset Allocation</h2>
          <PieChart slices={pieSlices} />
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-5">HMRC Utilisation</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                label: 'Loanbacks vs 50% Limit',
                value: totals.loanbacks,
                max: maxLoanback,
                color: gaugeColor(totals.loanbacks, maxLoanback, 0.9),
              },
              {
                label: 'Borrowing vs 50% Limit',
                value: totals.borrowing,
                max: maxBorrowing,
                color: gaugeColor(totals.borrowing, maxBorrowing, 0.9),
              },
              {
                label: 'Employer Investments vs 20% Limit',
                value: totals.employer,
                max: maxEmployer,
                color: gaugeColor(totals.employer, maxEmployer, 0.9),
              },
            ].map(g => (
              <div key={g.label} className="flex flex-col items-center">
                <GaugeChart
                  value={g.value}
                  max={g.max}
                  label={g.label}
                  color={g.color as 'red' | 'amber' | 'green'}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HMRC Capacity Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Loanback */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Loanback Capacity</h3>
            <StatusBadge status={capacityStatus(remainingLoanback, maxLoanback)} />
          </div>
          <dl className="space-y-2">
            <div className="flex justify-between text-sm"><dt className="text-gray-500">HMRC Limit (50%)</dt><dd className="font-semibold text-gray-800">{fmt(maxLoanback)}</dd></div>
            <div className="flex justify-between text-sm"><dt className="text-gray-500">Used</dt><dd className="font-semibold text-gray-800">{fmt(totals.loanbacks)}</dd></div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-100"><dt className="text-gray-500 font-medium">Remaining</dt><dd className={`font-bold ${remainingLoanback < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(remainingLoanback)}</dd></div>
          </dl>
        </div>

        {/* Borrowing */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Borrowing Capacity</h3>
            <StatusBadge status={capacityStatus(remainingBorrowing, maxBorrowing)} />
          </div>
          <dl className="space-y-2">
            <div className="flex justify-between text-sm"><dt className="text-gray-500">HMRC Limit (50%)</dt><dd className="font-semibold text-gray-800">{fmt(maxBorrowing)}</dd></div>
            <div className="flex justify-between text-sm"><dt className="text-gray-500">Used</dt><dd className="font-semibold text-gray-800">{fmt(totals.borrowing)}</dd></div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-100"><dt className="text-gray-500 font-medium">Remaining</dt><dd className={`font-bold ${remainingBorrowing < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(remainingBorrowing)}</dd></div>
          </dl>
        </div>

        {/* Employer Investments */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Employer-Related Investments</h3>
            <StatusBadge status={empStatus} />
          </div>
          <dl className="space-y-2">
            <div className="flex justify-between text-sm"><dt className="text-gray-500">Per-employer limit (5%)</dt><dd className="font-semibold text-gray-800">{fmt(0.05 * displayNav)}</dd></div>
            <div className="flex justify-between text-sm"><dt className="text-gray-500">Aggregate limit (20%)</dt><dd className="font-semibold text-gray-800">{fmt(maxEmployer)}</dd></div>
            <div className="flex justify-between text-sm"><dt className="text-gray-500">Aggregate used</dt><dd className="font-semibold text-gray-800">{fmt(totals.employer)}</dd></div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-100"><dt className="text-gray-500 font-medium">Aggregate remaining</dt><dd className={`font-bold ${remainingEmployer < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(remainingEmployer)}</dd></div>
          </dl>
        </div>
      </div>

      {/* Utilisation Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Utilisation Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Type', 'Amount Used', 'HMRC Limit', 'Remaining Capacity', 'Status'].map(h => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {utilTable.map(row => (
                <tr key={row.type} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-800">{row.type}</td>
                  <td className="px-6 py-3 text-gray-700">{fmtFull(row.amount)}</td>
                  <td className="px-6 py-3 text-gray-600">{row.limit}</td>
                  <td className="px-6 py-3 text-gray-600">{row.remaining}</td>
                  <td className="px-6 py-3"><StatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
