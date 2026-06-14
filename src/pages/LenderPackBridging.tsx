import { useEffect, useState, useCallback } from 'react';
import { Printer, Save, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, BridgingLenderPackSettings, SecurityRow, BridgingExitScenario } from '../types';
import StatusBadge from '../components/StatusBadge';

import CurrencyInput from '../components/CurrencyInput';
import { fmt, fmtFull } from '../lib/format';

function pctFmt(v: number) { return `${v.toFixed(2)}%`; }

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white';
const labelCls = 'block text-xs font-medium text-gray-500 mb-1';
const textareaCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none bg-white';

const emptySecurity = (): SecurityRow => ({
  asset_type: 'Property', asset_name: '', value: 0, charge_rank: '1st', existing_charges: '', net_realisation_value: 0,
});
const emptyExit = (): BridgingExitScenario => ({
  scenario_name: '', exit_valuation: 0, exit_date: '', exit_method: 'Refinance',
});

const defaultDraft = (schemeId: string): Omit<BridgingLenderPackSettings, 'id' | 'created_at' | 'updated_at'> => ({
  scheme_id: schemeId,
  title: 'SSAS Bridging Lender Pack',
  report_date: new Date().toISOString().slice(0, 10),
  prepared_by: '',
  bridging_loan_amount: 0,
  bridging_loan_term_months: 12,
  bridging_rate_pa: 8,
  arrangement_fee_pct: 2,
  exit_fee_pct: 1,
  security_schedule: [],
  exit_scenarios: [],
});

interface Props { scheme: SsasScheme; }

export default function LenderPackBridging({ scheme }: Props) {
  const [settings, setSettings] = useState<BridgingLenderPackSettings | null>(null);
  const [draft, setDraft] = useState<Omit<BridgingLenderPackSettings, 'id' | 'created_at' | 'updated_at'>>(defaultDraft(scheme.id));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('bridging_lender_pack_settings').select('*').eq('scheme_id', scheme.id).maybeSingle();
    if (data) {
      const d = {
        ...data,
        security_schedule: (data.security_schedule ?? []) as SecurityRow[],
        exit_scenarios: (data.exit_scenarios ?? []) as BridgingExitScenario[],
      };
      setSettings(d as BridgingLenderPackSettings);
      setDraft(d as Omit<BridgingLenderPackSettings, 'id' | 'created_at' | 'updated_at'>);
    }
  }, [scheme.id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    if (settings) {
      await supabase.from('bridging_lender_pack_settings').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', settings.id);
    } else {
      const { data } = await supabase.from('bridging_lender_pack_settings').insert(draft).select().single();
      if (data) setSettings(data as BridgingLenderPackSettings);
    }
    setSaving(false);
  }

  const set = (f: string, v: unknown) => setDraft(d => ({ ...d, [f]: v }));

  const setSecurity = (i: number, f: keyof SecurityRow, v: unknown) =>
    set('security_schedule', draft.security_schedule.map((r, idx) => idx === i ? { ...r, [f]: v } : r));
  const setExit = (i: number, f: keyof BridgingExitScenario, v: unknown) =>
    set('exit_scenarios', draft.exit_scenarios.map((r, idx) => idx === i ? { ...r, [f]: v } : r));

  // Computed
  const loanAmt = Number(draft.bridging_loan_amount);
  const totalSecVal = draft.security_schedule.reduce((s, r) => s + Number(r.net_realisation_value), 0);
  const arrangementFee = loanAmt * (Number(draft.arrangement_fee_pct) / 100);
  const exitFee = loanAmt * (Number(draft.exit_fee_pct) / 100);
  const grossLTV = totalSecVal > 0 ? (loanAmt / totalSecVal) * 100 : 0;
  const ltvColor = grossLTV > 75 ? 'text-red-600' : grossLTV > 65 ? 'text-amber-600' : 'text-emerald-600';

  const inlineInput = (val: unknown, onChange: (v: string) => void, type = 'text', cls = 'w-full') =>
    <input type={type} value={String(val)} onChange={e => onChange(e.target.value)} className={`${cls} text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-500 no-print`} />;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lender Pack — Bridging</h1>
          <p className="text-sm text-gray-500 mt-0.5">Bridging loan security, LTV, costs and exit routes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <Save size={14} />{saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
            <Printer size={14} /> Export Bridging Pack (PDF)
          </button>
        </div>
      </div>

      <div className="print-content space-y-6">

        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Pack Title', field: 'title', span: 2 },
                { label: 'Report Date', field: 'report_date', type: 'date' },
                { label: 'Prepared By', field: 'prepared_by' },
              ].map(({ label, field, type, span }) => (
                <div key={field} className={span === 2 ? 'col-span-2' : ''}>
                  <label className={labelCls}>{label}</label>
                  <input type={type ?? 'text'} value={String((draft as Record<string, unknown>)[field] ?? '')} onChange={e => set(field, e.target.value)} className={`${inputCls} no-print`} />
                  <p className="hidden print:block text-sm font-semibold text-gray-800">{String((draft as Record<string, unknown>)[field] ?? '—')}</p>
                </div>
              ))}
              <div className="col-span-2 md:col-span-3">
                <p className="text-sm text-gray-500 font-medium">Scheme: {scheme.name} &nbsp;|&nbsp; NAV: {fmtFull(Number(scheme.net_asset_value))}</p>
              </div>
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

        {/* Security Schedule */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm print:shadow-none print:border-gray-300">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Security Overview</h2>
            <button onClick={() => set('security_schedule', [...draft.security_schedule, emptySecurity()])} className="no-print flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              <Plus size={12} /> Add Row
            </button>
          </div>
          {draft.security_schedule.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm no-print">No security rows. Click "Add Row" to begin.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Asset Type', 'Asset Name', 'Value', 'Charge Rank', 'Existing Charges', 'Net Realisation Value', ''].map(h => (
                      <th key={h} className={`text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${h === '' ? 'no-print' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {draft.security_schedule.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <select value={row.asset_type} onChange={e => setSecurity(i, 'asset_type', e.target.value)} className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-500 no-print">
                          {['Property', 'Cash', 'Loanback Security', 'Other'].map(o => <option key={o}>{o}</option>)}
                        </select>
                        <span className="hidden print:block text-sm text-gray-700">{row.asset_type}</span>
                      </td>
                      <td className="px-4 py-2">{inlineInput(row.asset_name, v => setSecurity(i, 'asset_name', v))}<span className="hidden print:block text-sm font-medium text-gray-800">{row.asset_name}</span></td>
                      <td className="px-4 py-2"><CurrencyInput value={Number(row.value)} onChange={v => setSecurity(i, 'value', v)} className="w-36 no-print" /><span className="hidden print:block text-sm text-gray-700">{fmt(Number(row.value))}</span></td>
                      <td className="px-4 py-2">{inlineInput(row.charge_rank, v => setSecurity(i, 'charge_rank', v), 'text', 'w-16')}<span className="hidden print:block text-sm text-gray-700">{row.charge_rank}</span></td>
                      <td className="px-4 py-2">{inlineInput(row.existing_charges, v => setSecurity(i, 'existing_charges', v))}<span className="hidden print:block text-sm text-gray-500">{row.existing_charges || '—'}</span></td>
                      <td className="px-4 py-2"><CurrencyInput value={Number(row.net_realisation_value)} onChange={v => setSecurity(i, 'net_realisation_value', v)} className="w-36 no-print" /><span className="hidden print:block text-sm font-semibold text-gray-800">{fmt(Number(row.net_realisation_value))}</span></td>
                      <td className="px-4 py-2 no-print"><button onClick={() => set('security_schedule', draft.security_schedule.filter((_, idx) => idx !== i))} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={5} className="px-4 py-2.5 text-sm font-semibold text-gray-700">Total Security Value</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-gray-900">{fmt(totalSecVal)}</td>
                    <td className="no-print" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Bridging Loan Terms */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Bridging Loan Terms</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-5 mb-5">
            {[
              { label: 'Loan Amount', field: 'bridging_loan_amount', isCurrency: true },
              { label: 'Term (months)', field: 'bridging_loan_term_months', isCurrency: false, step: '1' },
              { label: 'Rate p.a. (%)', field: 'bridging_rate_pa', isCurrency: false, step: '0.1' },
              { label: 'Arrangement Fee (%)', field: 'arrangement_fee_pct', isCurrency: false, step: '0.1' },
              { label: 'Exit Fee (%)', field: 'exit_fee_pct', isCurrency: false, step: '0.1' },
            ].map(({ label, field, isCurrency, step }) => (
              <div key={field}>
                <label className={labelCls}>{label}</label>
                {isCurrency ? (
                  <CurrencyInput value={Number((draft as Record<string, unknown>)[field])} onChange={v => set(field, v)} />
                ) : (
                  <input type="number" step={step} value={Number((draft as Record<string, unknown>)[field])} onChange={e => set(field, parseFloat(e.target.value) || 0)} className={inputCls} />
                )}
              </div>
            ))}
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {[
              { label: 'Total Security Value', value: fmt(totalSecVal), sub: `${draft.security_schedule.length} asset(s)`, color: 'text-gray-900' },
              { label: 'Bridging Loan Amount', value: fmt(loanAmt), sub: `${draft.bridging_loan_term_months} months @ ${draft.bridging_rate_pa}% p.a.`, color: 'text-gray-900' },
              { label: 'Gross LTV', value: pctFmt(grossLTV), sub: `${fmt(loanAmt)} ÷ ${fmt(totalSecVal)}`, color: ltvColor },
            ].map(c => (
              <div key={c.label} className="bg-gray-50 rounded-lg p-4 print:border print:border-gray-200 print:bg-white">
                <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Cost breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'Arrangement Fee', value: fmt(arrangementFee), sub: `${draft.arrangement_fee_pct}% of loan` },
              { label: 'Exit Fee', value: fmt(exitFee), sub: `${draft.exit_fee_pct}% of loan` },
              { label: 'Gross Interest (full term)', value: fmt(loanAmt * (Number(draft.bridging_rate_pa) / 100) * (Number(draft.bridging_loan_term_months) / 12)), sub: `${draft.bridging_loan_term_months} months` },
              { label: 'Total Costs', value: fmt(arrangementFee + exitFee + loanAmt * (Number(draft.bridging_rate_pa) / 100) * (Number(draft.bridging_loan_term_months) / 12)), sub: 'Arrangement + exit + interest' },
            ].map(c => (
              <div key={c.label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                <p className="font-bold text-gray-900">{c.value}</p>
                <p className="text-xs text-gray-400">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* LTV bar */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex justify-between text-xs text-gray-500 mb-1"><span>LTV</span><span className={`font-semibold ${ltvColor}`}>{pctFmt(grossLTV)}</span></div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${grossLTV > 75 ? 'bg-red-500' : grossLTV > 65 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(grossLTV, 100)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1"><span>0%</span><span>100%</span></div>
          </div>
        </div>

        {/* Exit Routes */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm print:shadow-none print:border-gray-300">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Exit Routes</h2>
            <button onClick={() => set('exit_scenarios', [...draft.exit_scenarios, emptyExit()])} className="no-print flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              <Plus size={12} /> Add Exit Route
            </button>
          </div>
          {draft.exit_scenarios.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm no-print">No exit routes defined. Click "Add Exit Route".</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Scenario', 'Exit Valuation', 'Exit Date', 'Exit LTV', 'Exit Method', ''].map(h => (
                      <th key={h} className={`text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${h === '' ? 'no-print' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {draft.exit_scenarios.map((sc, i) => {
                    const exitLTV = Number(sc.exit_valuation) > 0 ? (loanAmt / Number(sc.exit_valuation)) * 100 : 0;
                    const ltvC = exitLTV > 75 ? 'text-red-600' : exitLTV > 65 ? 'text-amber-600' : 'text-emerald-600';
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-2.5">{inlineInput(sc.scenario_name, v => setExit(i, 'scenario_name', v))}<span className="hidden print:block text-sm font-medium text-gray-800">{sc.scenario_name}</span></td>
                        <td className="px-5 py-2.5"><CurrencyInput value={Number(sc.exit_valuation)} onChange={v => setExit(i, 'exit_valuation', v)} className="w-36 no-print" /><span className="hidden print:block text-sm text-gray-700">{fmt(Number(sc.exit_valuation))}</span></td>
                        <td className="px-5 py-2.5">{inlineInput(sc.exit_date, v => setExit(i, 'exit_date', v), 'date', 'w-36')}<span className="hidden print:block text-sm text-gray-600">{sc.exit_date || '—'}</span></td>
                        <td className={`px-5 py-2.5 font-bold ${ltvC}`}>{pctFmt(exitLTV)}</td>
                        <td className="px-5 py-2.5">
                          <select value={sc.exit_method} onChange={e => setExit(i, 'exit_method', e.target.value)} className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-500 no-print">
                            {['Refinance', 'Sale', 'Other'].map(o => <option key={o}>{o}</option>)}
                          </select>
                          <span className="hidden print:block text-sm text-gray-600">{sc.exit_method}</span>
                        </td>
                        <td className="px-5 py-2.5 no-print"><button onClick={() => set('exit_scenarios', draft.exit_scenarios.filter((_, idx) => idx !== i))} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={13} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Print footer */}
        <div className="hidden print:block text-xs text-gray-400 text-center pt-4 border-t border-gray-200">
          Generated by Red Horizons SSAS Utilisation Planner — {new Date().toLocaleDateString('en-GB')} — Strictly Confidential
        </div>
      </div>
    </div>
  );
}
