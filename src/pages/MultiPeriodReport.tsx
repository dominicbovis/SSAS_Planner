import { useEffect, useState, useCallback } from 'react';
import { Printer, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, MultiPeriodReportSettings } from '../types';
import BarChart from '../components/BarChart';
import CurrencyInput from '../components/CurrencyInput';
import { fmt } from '../lib/format';

function pctStr(numerator: number, denominator: number) {
  if (!denominator) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

interface Props { scheme: SsasScheme; }

const defaultDraft = (schemeId: string): Omit<MultiPeriodReportSettings, 'id' | 'created_at' | 'updated_at'> => ({
  scheme_id: schemeId,
  report_title: 'SSAS Trustee Multi-Period Utilisation Report',
  report_date: new Date().toISOString().slice(0, 10),
  prepared_by: '',
  comparison_mode: 'Two Periods',
  commentary: '',
  period_1_label: 'Current Year',
  period_1_start_date: null,
  period_1_end_date: null,
  period_1_nav: 0,
  period_1_loanbacks: 0,
  period_1_borrowing: 0,
  period_1_employer_investments: 0,
  period_2_label: 'Prior Year',
  period_2_start_date: null,
  period_2_end_date: null,
  period_2_nav: 0,
  period_2_loanbacks: 0,
  period_2_borrowing: 0,
  period_2_employer_investments: 0,
  period_3_label: 'Baseline',
  period_3_start_date: null,
  period_3_end_date: null,
  period_3_nav: 0,
  period_3_loanbacks: 0,
  period_3_borrowing: 0,
  period_3_employer_investments: 0,
});

export default function MultiPeriodReport({ scheme }: Props) {
  const [settings, setSettings] = useState<MultiPeriodReportSettings | null>(null);
  const [draft, setDraft] = useState<Omit<MultiPeriodReportSettings, 'id' | 'created_at' | 'updated_at'>>(defaultDraft(scheme.id));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('multi_period_report_settings').select('*').eq('scheme_id', scheme.id).maybeSingle();
    if (data) { setSettings(data); setDraft({ ...data }); }
    else { setDraft(defaultDraft(scheme.id)); }
  }, [scheme.id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    if (settings) {
      await supabase.from('multi_period_report_settings').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', settings.id);
    } else {
      const { data } = await supabase.from('multi_period_report_settings').insert(draft).select().single();
      if (data) setSettings(data);
    }
    setSaving(false);
  }

  const set = (f: string, v: unknown) => setDraft(d => ({ ...d, [f]: v }));

  const threeMode = draft.comparison_mode === 'Three Periods';

  const periods = [
    { n: 1, label: draft.period_1_label, start: draft.period_1_start_date, end: draft.period_1_end_date, nav: Number(draft.period_1_nav), lb: Number(draft.period_1_loanbacks), borrow: Number(draft.period_1_borrowing), emp: Number(draft.period_1_employer_investments) },
    { n: 2, label: draft.period_2_label, start: draft.period_2_start_date, end: draft.period_2_end_date, nav: Number(draft.period_2_nav), lb: Number(draft.period_2_loanbacks), borrow: Number(draft.period_2_borrowing), emp: Number(draft.period_2_employer_investments) },
    ...(threeMode ? [{ n: 3, label: draft.period_3_label, start: draft.period_3_start_date, end: draft.period_3_end_date, nav: Number(draft.period_3_nav), lb: Number(draft.period_3_loanbacks), borrow: Number(draft.period_3_borrowing), emp: Number(draft.period_3_employer_investments) }] : []),
  ];

  const periodLabels = periods.map(p => p.label);

  const navBarSeries = [{ name: 'NAV at End', color: '#3b82f6', values: periods.map(p => p.nav) }];

  const usageBarSeries = [
    { name: 'Loanbacks % of NAV', color: '#f59e0b', values: periods.map(p => p.nav > 0 ? (p.lb / p.nav) * 100 : 0) },
    { name: 'Borrowing % of NAV', color: '#ef4444', values: periods.map(p => p.nav > 0 ? (p.borrow / p.nav) * 100 : 0) },
    { name: 'Employer Inv. % of NAV', color: '#10b981', values: periods.map(p => p.nav > 0 ? (p.emp / p.nav) * 100 : 0) },
  ];

  const inputCls = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1";

  const PeriodInputGroup = ({ n, prefix }: { n: number; prefix: string }) => {
    const labelKey = `period_${n}_label`;
    const startKey = `period_${n}_start_date`;
    const endKey = `period_${n}_end_date`;
    const navKey = `period_${n}_nav`;
    const lbKey = `period_${n}_loanbacks`;
    const borrowKey = `period_${n}_borrowing`;
    const empKey = `period_${n}_employer_investments`;
    const d = draft as Record<string, unknown>;
    return (
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
          <input value={String(d[labelKey] ?? '')} onChange={e => set(labelKey, e.target.value)} className="flex-1 text-sm font-semibold border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-red-500" placeholder={prefix} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Start Date</label><input type="date" value={String(d[startKey] ?? '')} onChange={e => set(startKey, e.target.value || null)} className={inputCls} /></div>
          <div><label className={labelCls}>End Date</label><input type="date" value={String(d[endKey] ?? '')} onChange={e => set(endKey, e.target.value || null)} className={inputCls} /></div>
          <div><label className={labelCls}>NAV at End</label><CurrencyInput value={Number(d[navKey])} onChange={v => set(navKey, v)} /></div>
          <div><label className={labelCls}>Loanbacks</label><CurrencyInput value={Number(d[lbKey])} onChange={v => set(lbKey, v)} /></div>
          <div><label className={labelCls}>Borrowing</label><CurrencyInput value={Number(d[borrowKey])} onChange={v => set(borrowKey, v)} /></div>
          <div><label className={labelCls}>Employer Investments</label><CurrencyInput value={Number(d[empKey])} onChange={v => set(empKey, v)} /></div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Multi-Period Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Compare utilisation metrics across two or three periods</p>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <Save size={14} />{saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
            <Printer size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* ===== PRINTABLE REPORT ===== */}
      <div className="print-content space-y-6">

        {/* Report Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Report Title', field: 'report_title', type: 'text', span: 2 },
              { label: 'Report Date', field: 'report_date', type: 'date' },
              { label: 'Prepared By', field: 'prepared_by', type: 'text' },
            ].map(({ label, field, type, span }) => (
              <div key={field} className={span === 2 ? 'col-span-2' : ''}>
                <label className={labelCls}>{label}</label>
                <input type={type} value={String((draft as Record<string, unknown>)[field] ?? '')} onChange={e => set(field, e.target.value)} className={`${inputCls} no-print`} />
                <p className="hidden print:block text-sm text-gray-700 font-medium">{String((draft as Record<string, unknown>)[field] ?? '—')}</p>
              </div>
            ))}
            <div>
              <label className={`${labelCls} no-print`}>Comparison Mode</label>
              <select value={draft.comparison_mode} onChange={e => set('comparison_mode', e.target.value)} className={`${inputCls} no-print`}>
                <option>Two Periods</option>
                <option>Three Periods</option>
              </select>
              <p className="hidden print:block text-sm text-gray-600">{draft.comparison_mode}</p>
            </div>
          </div>
        </div>

        {/* Period Data Entry (no-print) */}
        <div className="no-print bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Period Data Input</h2>
          <p className="text-xs text-gray-400 mb-4">Enter the end-of-period valuations for each comparison period. These are manually entered snapshots.</p>
          <div className={`grid gap-5 ${threeMode ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
            <PeriodInputGroup n={1} prefix="Current Year" />
            <PeriodInputGroup n={2} prefix="Prior Year" />
            {threeMode && <PeriodInputGroup n={3} prefix="Baseline" />}
          </div>
        </div>

        {/* Period Metrics Summary Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden print:shadow-none print:border-gray-300">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Period Metrics Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Period', 'Start Date', 'End Date', 'NAV at End', 'Loanbacks', 'Borrowing', 'Employer Inv.', 'Loanback %', 'Borrowing %', 'Employer Inv. %'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {periods.map(p => (
                  <tr key={p.n} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-800">{p.label}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.start ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.end ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{fmt(p.nav)}</td>
                    <td className="px-4 py-3 text-gray-700">{fmt(p.lb)}</td>
                    <td className="px-4 py-3 text-gray-700">{fmt(p.borrow)}</td>
                    <td className="px-4 py-3 text-gray-700">{fmt(p.emp)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${p.nav > 0 && p.lb / p.nav > 0.5 ? 'text-red-600' : p.nav > 0 && p.lb / p.nav > 0.45 ? 'text-amber-600' : 'text-gray-700'}`}>
                          {pctStr(p.lb, p.nav)}
                        </span>
                        <span className="text-[10px] text-gray-400">(lim 50%)</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${p.nav > 0 && p.borrow / p.nav > 0.5 ? 'text-red-600' : p.nav > 0 && p.borrow / p.nav > 0.45 ? 'text-amber-600' : 'text-gray-700'}`}>
                          {pctStr(p.borrow, p.nav)}
                        </span>
                        <span className="text-[10px] text-gray-400">(lim 50%)</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${p.nav > 0 && p.emp / p.nav > 0.20 ? 'text-red-600' : p.nav > 0 && p.emp / p.nav > 0.18 ? 'text-amber-600' : 'text-gray-700'}`}>
                          {pctStr(p.emp, p.nav)}
                        </span>
                        <span className="text-[10px] text-gray-400">(lim 20%)</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">NAV Over Periods</h2>
            <BarChart categories={periodLabels} series={navBarSeries} />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">HMRC Usage % by Period</h2>
            <BarChart categories={periodLabels} series={usageBarSeries} />
          </div>
        </div>

        {/* Period comparison detail cards */}
        <div className={`grid gap-4 ${threeMode ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
          {periods.map(p => {
            const lbPct = p.nav > 0 ? (p.lb / p.nav) * 100 : 0;
            const borrowPct = p.nav > 0 ? (p.borrow / p.nav) * 100 : 0;
            const empPct = p.nav > 0 ? (p.emp / p.nav) * 100 : 0;
            return (
              <div key={p.n} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 print:shadow-none print:border-gray-300">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{p.n}</span>
                  <h3 className="text-sm font-semibold text-gray-800">{p.label}</h3>
                </div>
                <dl className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <dt className="text-gray-500">NAV</dt>
                      <dd className="font-bold text-gray-800">{fmt(p.nav)}</dd>
                    </div>
                  </div>
                  {[
                    { name: 'Loanbacks', used: p.lb, pct: lbPct, limit: 50, color: lbPct > 50 ? 'bg-red-500' : lbPct > 45 ? 'bg-amber-400' : 'bg-emerald-500' },
                    { name: 'Borrowing', used: p.borrow, pct: borrowPct, limit: 50, color: borrowPct > 50 ? 'bg-red-500' : borrowPct > 45 ? 'bg-amber-400' : 'bg-emerald-500' },
                    { name: 'Employer Inv.', used: p.emp, pct: empPct, limit: 20, color: empPct > 20 ? 'bg-red-500' : empPct > 18 ? 'bg-amber-400' : 'bg-emerald-500' },
                  ].map(r => (
                    <div key={r.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <dt className="text-gray-500">{r.name}</dt>
                        <dd className={`font-semibold ${r.pct > r.limit ? 'text-red-600' : 'text-gray-700'}`}>
                          {fmt(r.used)} <span className="text-gray-400 font-normal">({r.pct.toFixed(1)}%)</span>
                        </dd>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${r.color}`} style={{ width: `${Math.min((r.pct / r.limit) * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>

        {/* Commentary */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Multi-Period Commentary</h2>
          <p className="text-xs text-gray-400 mb-2 no-print">
            Explain key changes in NAV, loanbacks, borrowing and employer-related investments between periods, and any HMRC headroom trends.
          </p>
          <textarea
            value={draft.commentary}
            onChange={e => set('commentary', e.target.value)}
            rows={6}
            placeholder="Summarise NAV trends, utilisation changes and HMRC headroom movements between periods…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none no-print"
          />
          <div className="hidden print:block text-sm text-gray-700 leading-relaxed whitespace-pre-wrap min-h-[80px] border border-gray-200 rounded-lg p-3">
            {draft.commentary || 'Commentary to be completed.'}
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
