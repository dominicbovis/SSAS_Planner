import { useEffect, useState, useCallback } from 'react';
import { Save, RefreshCw, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, ValuationSettings, PropertyIncomeAssumption, PropertyRecord } from '../types';
import BarChart from '../components/BarChart';
import CurrencyInput from '../components/CurrencyInput';
import { fmt, fmtFull } from '../lib/format';

function pctFmt(v: number) { return `${v.toFixed(2)}%`; }

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500';
const labelCls = 'block text-xs font-medium text-gray-500 mb-1';

const defaultSettings = (schemeId: string): Omit<ValuationSettings, 'id' | 'created_at' | 'updated_at'> => ({
  scheme_id: schemeId,
  valuation_date: new Date().toISOString().slice(0, 10),
  capitalisation_rate: 6.0,
  yield_shift_down: -0.5,
  yield_shift_up: 0.5,
  vacancy_allowance_pct: 5.0,
  non_recoverable_costs_pct: 2.0,
  proposed_borrowing: 0,
});

interface PropertyRow extends PropertyRecord {
  assumption: Omit<PropertyIncomeAssumption, 'id' | 'created_at' | 'updated_at'>;
  effectiveRent: number;
}

interface Props { scheme: SsasScheme; }

export default function ValuationModel({ scheme }: Props) {
  const [vs, setVs] = useState<ValuationSettings | null>(null);
  const [draft, setDraft] = useState<Omit<ValuationSettings, 'id' | 'created_at' | 'updated_at'>>(defaultSettings(scheme.id));
  const [rows, setRows] = useState<PropertyRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [vsData, propData, assumData] = await Promise.all([
      supabase.from('valuation_settings').select('*').eq('scheme_id', scheme.id).maybeSingle(),
      supabase.from('property_register').select('*').eq('scheme_id', scheme.id).order('property_name'),
      supabase.from('property_income_assumptions').select('*').eq('scheme_id', scheme.id),
    ]);

    if (vsData.data) { setVs(vsData.data); setDraft({ ...vsData.data }); }
    else setDraft(defaultSettings(scheme.id));

    const d = vsData.data ?? defaultSettings(scheme.id);
    const vacPct = Number(d.vacancy_allowance_pct) / 100;

    const props: PropertyRow[] = (propData.data ?? []).map(p => {
      const a = (assumData.data ?? []).find(a => a.property_id === p.id);
      const assumption: Omit<PropertyIncomeAssumption, 'id' | 'created_at' | 'updated_at'> = {
        scheme_id: scheme.id,
        property_id: p.id,
        current_rent_pa: Number(a?.current_rent_pa ?? 0),
        market_rent_pa: Number(a?.market_rent_pa ?? p.annual_rent ?? 0),
        erv_rent_pa: Number(a?.erv_rent_pa ?? 0),
        void_assumption_months: Number(a?.void_assumption_months ?? 0),
        capex_allowance_pa: Number(a?.capex_allowance_pa ?? 0),
      };
      const effectiveRent = assumption.market_rent_pa * (1 - vacPct) - assumption.capex_allowance_pa;
      return { ...p, assumption, effectiveRent };
    });
    setRows(props);
    setLoading(false);
  }, [scheme.id]);

  useEffect(() => { load(); }, [load]);

  // Recompute effective rents when vacancy changes
  useEffect(() => {
    const vacPct = Number(draft.vacancy_allowance_pct) / 100;
    setRows(r => r.map(p => ({
      ...p,
      effectiveRent: p.assumption.market_rent_pa * (1 - vacPct) - p.assumption.capex_allowance_pa,
    })));
  }, [draft.vacancy_allowance_pct]);

  function updateAssumption(propertyId: string, field: string, value: number) {
    setRows(prev => prev.map(p => {
      if (p.id !== propertyId) return p;
      const newAssumption = { ...p.assumption, [field]: value };
      const vacPct = Number(draft.vacancy_allowance_pct) / 100;
      const effectiveRent = newAssumption.market_rent_pa * (1 - vacPct) - newAssumption.capex_allowance_pa;
      return { ...p, assumption: newAssumption, effectiveRent };
    }));
  }

  async function save() {
    setSaving(true);
    // Save valuation settings
    let settingsId = vs?.id;
    if (vs) {
      await supabase.from('valuation_settings').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', vs.id);
    } else {
      const { data } = await supabase.from('valuation_settings').insert(draft).select().single();
      if (data) { setVs(data); settingsId = data.id; }
    }

    // Upsert property income assumptions
    for (const row of rows) {
      const existing = await supabase
        .from('property_income_assumptions')
        .select('id')
        .eq('property_id', row.id)
        .maybeSingle();
      if (existing.data) {
        await supabase.from('property_income_assumptions')
          .update({ ...row.assumption, updated_at: new Date().toISOString() })
          .eq('id', existing.data.id);
      } else {
        await supabase.from('property_income_assumptions')
          .insert({ ...row.assumption, scheme_id: scheme.id });
      }
    }
    setSaving(false);
    void settingsId;
  }

  const setDraftField = (f: string, v: unknown) => setDraft(d => ({ ...d, [f]: v }));

  // Computed valuations
  const totalEffectiveRent = rows.reduce((s, r) => s + r.effectiveRent, 0);
  const capRate = Number(draft.capitalisation_rate) / 100;
  const yieldDown = capRate + Number(draft.yield_shift_down) / 100;
  const yieldUp = capRate + Number(draft.yield_shift_up) / 100;

  const coreVal = capRate > 0 ? totalEffectiveRent / capRate : 0;
  const valDown = yieldDown > 0 ? totalEffectiveRent / yieldDown : 0;
  const valUp = yieldUp > 0 ? totalEffectiveRent / yieldUp : 0;

  const proposedBorrowing = Number(draft.proposed_borrowing);
  const ltvCore = coreVal > 0 ? (proposedBorrowing / coreVal) * 100 : 0;
  const ltvDown = valDown > 0 ? (proposedBorrowing / valDown) * 100 : 0;
  const ltvUp = valUp > 0 ? (proposedBorrowing / valUp) * 100 : 0;

  const ltvColor = (ltv: number) => ltv > 75 ? 'text-red-600' : ltv > 65 ? 'text-amber-600' : 'text-emerald-600';

  const ltvBarSeries = [
    { name: 'Valuation', color: '#3b82f6', values: [coreVal, valDown, valUp] },
    { name: 'Borrowing', color: '#ef4444', values: [proposedBorrowing, proposedBorrowing, proposedBorrowing] },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Valuation Model</h1>
          <p className="text-sm text-gray-500 mt-0.5">Income capitalisation model with yield sensitivity analysis</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
            <Save size={14} />{saving ? 'Saving…' : 'Save Model'}
          </button>
        </div>
      </div>

      {/* Valuation Settings */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Valuation Settings</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
          <div>
            <label className={labelCls}>Valuation Date</label>
            <input type="date" value={draft.valuation_date} onChange={e => setDraftField('valuation_date', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Cap Rate (%)</label>
            <input type="number" step="0.1" value={Number(draft.capitalisation_rate)} onChange={e => setDraftField('capitalisation_rate', parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Yield Shift Down (%)</label>
            <input type="number" step="0.1" value={Number(draft.yield_shift_down)} onChange={e => setDraftField('yield_shift_down', parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Yield Shift Up (%)</label>
            <input type="number" step="0.1" value={Number(draft.yield_shift_up)} onChange={e => setDraftField('yield_shift_up', parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Vacancy Allowance (%)</label>
            <input type="number" step="0.5" value={Number(draft.vacancy_allowance_pct)} onChange={e => setDraftField('vacancy_allowance_pct', parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Non-Recoverable Costs (%)</label>
            <input type="number" step="0.5" value={Number(draft.non_recoverable_costs_pct)} onChange={e => setDraftField('non_recoverable_costs_pct', parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Property Income Assumptions */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Property Income Assumptions</h2>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Info size={12} />
            <span>Effective Rent = Market Rent × (1 − Vacancy%) − Capex</span>
          </div>
        </div>
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">No properties found. Add properties in the Property Register first.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Property', 'Current Rent p.a.', 'Market Rent p.a.', 'ERV p.a.', 'Void (months)', 'Capex p.a.', 'Effective Rent'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">{row.property_name}</td>
                    {[
                      { field: 'current_rent_pa', val: row.assumption.current_rent_pa, isCurrency: true },
                      { field: 'market_rent_pa', val: row.assumption.market_rent_pa, isCurrency: true },
                      { field: 'erv_rent_pa', val: row.assumption.erv_rent_pa, isCurrency: true },
                      { field: 'void_assumption_months', val: row.assumption.void_assumption_months, isCurrency: false },
                      { field: 'capex_allowance_pa', val: row.assumption.capex_allowance_pa, isCurrency: true },
                    ].map(({ field, val, isCurrency }) => (
                      <td key={field} className="px-5 py-3">
                        {isCurrency ? (
                          <CurrencyInput
                            value={val}
                            onChange={v => updateAssumption(row.id, field, v)}
                            className="w-36"
                          />
                        ) : (
                          <input
                            type="number"
                            step="0.5"
                            value={val}
                            onChange={e => updateAssumption(row.id, field, parseFloat(e.target.value) || 0)}
                            className="w-20 text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                          />
                        )}
                      </td>
                    ))}
                    <td className={`px-5 py-3 font-bold whitespace-nowrap ${row.effectiveRent < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {fmtFull(row.effectiveRent)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-5 py-3 text-sm font-semibold text-gray-700">Total</td>
                  <td className="px-5 py-3 text-sm font-semibold text-gray-700">{fmt(rows.reduce((s, r) => s + r.assumption.current_rent_pa, 0))}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-gray-700">{fmt(rows.reduce((s, r) => s + r.assumption.market_rent_pa, 0))}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-gray-700">{fmt(rows.reduce((s, r) => s + r.assumption.erv_rent_pa, 0))}</td>
                  <td colSpan={2} />
                  <td className="px-5 py-3 text-sm font-bold text-gray-900">{fmtFull(totalEffectiveRent)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Capital Value Calculation */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-5">Capital Value Calculation</h2>

        {/* Formula display */}
        <div className="bg-gray-50 rounded-lg p-4 mb-5 flex flex-wrap gap-8 text-sm">
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Effective Rent</p>
            <p className="text-lg font-bold text-gray-900">{fmtFull(totalEffectiveRent)}</p>
          </div>
          <div className="flex items-center text-gray-300 text-2xl font-light">÷</div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Cap Rate</p>
            <p className="text-lg font-bold text-gray-900">{pctFmt(Number(draft.capitalisation_rate))}</p>
          </div>
          <div className="flex items-center text-gray-300 text-2xl font-light">=</div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Core Valuation</p>
            <p className="text-lg font-bold text-blue-700">{fmt(coreVal)}</p>
          </div>
        </div>

        {/* Valuation cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[
            { title: 'Core Valuation', val: coreVal, rate: Number(draft.capitalisation_rate), sub: `At ${pctFmt(Number(draft.capitalisation_rate))} cap rate`, color: 'border-blue-200 bg-blue-50' },
            { title: `Valuation (Yield ${Number(draft.yield_shift_down) >= 0 ? '+' : ''}${draft.yield_shift_down}%)`, val: valDown, rate: yieldDown * 100, sub: `At ${pctFmt(yieldDown * 100)} cap rate`, color: 'border-emerald-200 bg-emerald-50' },
            { title: `Valuation (Yield +${draft.yield_shift_up}%)`, val: valUp, rate: yieldUp * 100, sub: `At ${pctFmt(yieldUp * 100)} cap rate`, color: 'border-amber-200 bg-amber-50' },
          ].map(c => (
            <div key={c.title} className={`rounded-xl border p-5 ${c.color}`}>
              <p className="text-xs font-semibold text-gray-600 mb-2">{c.title}</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(c.val)}</p>
              <p className="text-xs text-gray-500 mt-1">{c.sub}</p>
              <div className="mt-3 pt-3 border-t border-white/60 flex justify-between text-xs">
                <span className="text-gray-500">vs core</span>
                <span className={c.val >= coreVal ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>
                  {c.val >= coreVal ? '+' : ''}{fmt(c.val - coreVal)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* LTV section */}
        <div className="border-t border-gray-100 pt-5">
          <div className="flex items-center gap-5 mb-5 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-700">LTV & Headroom</h3>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Proposed Borrowing</label>
              <CurrencyInput
                value={proposedBorrowing}
                onChange={v => setDraftField('proposed_borrowing', v)}
                className="w-44"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {[
              { label: 'LTV — Core', val: coreVal, ltv: ltvCore },
              { label: `LTV — Yield ${Number(draft.yield_shift_down) >= 0 ? '+' : ''}${draft.yield_shift_down}%`, val: valDown, ltv: ltvDown },
              { label: `LTV — Yield +${draft.yield_shift_up}%`, val: valUp, ltv: ltvUp },
            ].map(c => (
              <div key={c.label} className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-500 mb-2">{c.label}</p>
                <p className="text-xs text-gray-500 mb-1">Valuation: <span className="font-semibold text-gray-700">{fmt(c.val)}</span></p>
                <p className="text-xs text-gray-500 mb-1">Borrowing: <span className="font-semibold text-gray-700">{fmt(proposedBorrowing)}</span></p>
                <p className={`text-2xl font-bold mt-2 ${ltvColor(c.ltv)}`}>{pctFmt(c.ltv)}</p>
                <p className="text-xs text-gray-400 mt-0.5">LTV ratio</p>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${c.ltv > 75 ? 'bg-red-500' : c.ltv > 65 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(c.ltv, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* LTV sensitivity table */}
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Scenario', 'Cap Rate', 'Valuation', 'Borrowing', 'LTV', 'Headroom'].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { label: 'Core', val: coreVal, rate: Number(draft.capitalisation_rate), ltv: ltvCore },
                  { label: `Yield ${Number(draft.yield_shift_down) >= 0 ? '+' : ''}${draft.yield_shift_down}%`, val: valDown, rate: yieldDown * 100, ltv: ltvDown },
                  { label: `Yield +${draft.yield_shift_up}%`, val: valUp, rate: yieldUp * 100, ltv: ltvUp },
                ].map(r => (
                  <tr key={r.label} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 font-medium text-gray-800">{r.label}</td>
                    <td className="px-5 py-2.5 text-gray-600">{pctFmt(r.rate)}</td>
                    <td className="px-5 py-2.5 font-semibold text-gray-800">{fmt(r.val)}</td>
                    <td className="px-5 py-2.5 text-gray-700">{fmt(proposedBorrowing)}</td>
                    <td className={`px-5 py-2.5 font-bold ${ltvColor(r.ltv)}`}>{pctFmt(r.ltv)}</td>
                    <td className={`px-5 py-2.5 font-semibold ${r.val - proposedBorrowing < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmt(r.val - proposedBorrowing)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bar chart */}
          <BarChart
            categories={['Core', `Yield ${Number(draft.yield_shift_down) >= 0 ? '+' : ''}${draft.yield_shift_down}%`, `Yield +${draft.yield_shift_up}%`]}
            series={ltvBarSeries}
            title="Valuation vs Borrowing by Scenario"
          />
        </div>
      </div>
    </div>
  );
}
