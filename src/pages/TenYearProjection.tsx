import { useEffect, useState, useCallback } from 'react';
import { Printer, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, TenYearProjectionSettings } from '../types';
import LineChart from '../components/LineChart';
import BarChart from '../components/BarChart';

function fmt(v: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(v);
}

function fmtM(v: number) {
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(2)}m`;
  return `£${(v / 1000).toFixed(0)}k`;
}

interface ProjectionRow {
  year: number;
  openingNAV: number;
  contributions: number;
  benefits: number;
  growth: number;
  closingNAV: number;
  projectedLoanbacks: number;
  hmrcMaxLoanback: number;
  loanbackHeadroom: number;
  projectedBorrowing: number;
  hmrcMaxBorrowing: number;
  borrowingHeadroom: number;
  projectedEmployer: number;
  hmrcMaxEmployer: number;
  employerHeadroom: number;
}

interface Props { scheme: SsasScheme; }

const defaultDraft = (schemeId: string, year: number): Omit<TenYearProjectionSettings, 'id' | 'created_at' | 'updated_at'> => ({
  scheme_id: schemeId,
  projection_start_year: year,
  projection_years: 10,
  annual_nav_growth_rate: 5,
  annual_contribution: 0,
  annual_benefit_outflow: 0,
  target_loanback_pct: 30,
  target_borrowing_pct: 20,
  target_employer_investments_pct: 10,
  commentary: '',
});

function computeRows(nav: number, settings: Omit<TenYearProjectionSettings, 'id' | 'created_at' | 'updated_at'>): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  const years = Math.min(Math.max(1, Number(settings.projection_years)), 10);
  const growthRate = Number(settings.annual_nav_growth_rate) / 100;
  const contributions = Number(settings.annual_contribution);
  const benefits = Number(settings.annual_benefit_outflow);
  const lbPct = Number(settings.target_loanback_pct) / 100;
  const borrowPct = Number(settings.target_borrowing_pct) / 100;
  const empPct = Number(settings.target_employer_investments_pct) / 100;

  for (let n = 1; n <= years; n++) {
    const openingNAV = n === 1 ? nav : rows[n - 2].closingNAV;
    const preGrowth = openingNAV + contributions - benefits;
    const growth = preGrowth * growthRate;
    const closingNAV = preGrowth + growth;

    const projectedLoanbacks = closingNAV * lbPct;
    const hmrcMaxLoanback = 0.5 * closingNAV;
    const projectedBorrowing = closingNAV * borrowPct;
    const hmrcMaxBorrowing = 0.5 * closingNAV;
    const projectedEmployer = closingNAV * empPct;
    const hmrcMaxEmployer = 0.20 * closingNAV;

    rows.push({
      year: Number(settings.projection_start_year) + (n - 1),
      openingNAV,
      contributions,
      benefits,
      growth,
      closingNAV,
      projectedLoanbacks,
      hmrcMaxLoanback,
      loanbackHeadroom: hmrcMaxLoanback - projectedLoanbacks,
      projectedBorrowing,
      hmrcMaxBorrowing,
      borrowingHeadroom: hmrcMaxBorrowing - projectedBorrowing,
      projectedEmployer,
      hmrcMaxEmployer,
      employerHeadroom: hmrcMaxEmployer - projectedEmployer,
    });
  }
  return rows;
}

export default function TenYearProjection({ scheme }: Props) {
  const [settings, setSettings] = useState<TenYearProjectionSettings | null>(null);
  const [draft, setDraft] = useState<Omit<TenYearProjectionSettings, 'id' | 'created_at' | 'updated_at'>>(defaultDraft(scheme.id, new Date().getFullYear()));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('ten_year_projection_settings').select('*').eq('scheme_id', scheme.id).maybeSingle();
    if (data) { setSettings(data); setDraft({ ...data }); }
    else { setDraft(defaultDraft(scheme.id, new Date().getFullYear())); }
  }, [scheme.id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    if (settings) {
      await supabase.from('ten_year_projection_settings').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', settings.id);
    } else {
      const { data } = await supabase.from('ten_year_projection_settings').insert(draft).select().single();
      if (data) setSettings(data);
    }
    setSaving(false);
  }

  const set = (f: string, v: unknown) => setDraft(d => ({ ...d, [f]: v }));

  const rows = computeRows(Number(scheme.net_asset_value), draft);
  const yearLabels = rows.map(r => String(r.year));

  const navLineSeries = [{ name: 'Closing NAV', color: '#3b82f6', values: rows.map(r => r.closingNAV) }];

  const headroomBarSeries = [
    { name: 'Loanback Headroom', color: '#f59e0b', values: rows.map(r => r.loanbackHeadroom) },
    { name: 'Borrowing Headroom', color: '#ef4444', values: rows.map(r => r.borrowingHeadroom) },
    { name: 'Employer Inv. Headroom', color: '#10b981', values: rows.map(r => r.employerHeadroom) },
  ];

  const inputCls = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1";

  const finalNAV = rows[rows.length - 1]?.closingNAV ?? Number(scheme.net_asset_value);
  const navGrowthPct = rows.length ? ((finalNAV - Number(scheme.net_asset_value)) / Number(scheme.net_asset_value)) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">10-Year Projection</h1>
          <p className="text-sm text-gray-500 mt-0.5">Long-term NAV and HMRC headroom modelling</p>
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

      {/* ===== PRINTABLE CONTENT ===== */}
      <div className="print-content space-y-6">

        {/* Settings */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Projection Settings</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { label: 'Start Year', field: 'projection_start_year', type: 'number', min: 2020, max: 2050 },
              { label: 'Years (max 10)', field: 'projection_years', type: 'number', min: 1, max: 10 },
              { label: 'Annual NAV Growth Rate (%)', field: 'annual_nav_growth_rate', type: 'number', step: 0.1 },
              { label: 'Annual Contributions (£)', field: 'annual_contribution', type: 'number', step: 1000 },
              { label: 'Annual Benefit Outflows (£)', field: 'annual_benefit_outflow', type: 'number', step: 1000 },
              { label: 'Target Loanback % of NAV', field: 'target_loanback_pct', type: 'number', step: 0.5 },
              { label: 'Target Borrowing % of NAV', field: 'target_borrowing_pct', type: 'number', step: 0.5 },
              { label: 'Target Employer Inv. % of NAV', field: 'target_employer_investments_pct', type: 'number', step: 0.5 },
            ].map(({ label, field, type, min, max, step }) => (
              <div key={field}>
                <label className={labelCls}>{label}</label>
                <input
                  type={type}
                  min={min}
                  max={max}
                  step={step}
                  value={Number((draft as Record<string, unknown>)[field])}
                  onChange={e => set(field, field === 'projection_start_year' || field === 'projection_years' ? parseInt(e.target.value) || 10 : parseFloat(e.target.value) || 0)}
                  className={`${inputCls} no-print`}
                />
                <p className="hidden print:block text-sm text-gray-700">{String((draft as Record<string, unknown>)[field])}</p>
              </div>
            ))}
          </div>

          {/* Settings summary for print */}
          <div className="hidden print:grid print:grid-cols-4 print:gap-3 print:mt-2 print:pt-3 print:border-t print:border-gray-100">
            <div><p className="text-xs text-gray-500">Opening NAV</p><p className="text-sm font-bold">{fmt(Number(scheme.net_asset_value))}</p></div>
            <div><p className="text-xs text-gray-500">Growth Rate</p><p className="text-sm font-bold">{draft.annual_nav_growth_rate}% p.a.</p></div>
            <div><p className="text-xs text-gray-500">Annual Contributions</p><p className="text-sm font-bold">{fmt(Number(draft.annual_contribution))}</p></div>
            <div><p className="text-xs text-gray-500">Annual Benefits</p><p className="text-sm font-bold">{fmt(Number(draft.annual_benefit_outflow))}</p></div>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Opening NAV', value: fmt(Number(scheme.net_asset_value)), sub: 'Current' },
            { label: `Projected NAV (Yr ${rows.length})`, value: fmtM(finalNAV), sub: `${navGrowthPct >= 0 ? '+' : ''}${navGrowthPct.toFixed(1)}% total growth` },
            { label: 'Max Loanback Capacity', value: fmtM(0.5 * finalNAV), sub: `50% of projected NAV` },
            { label: 'Max Employer Inv. Capacity', value: fmtM(0.20 * finalNAV), sub: `20% of projected NAV` },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 print:shadow-none print:border-gray-300">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className="text-xl font-bold text-gray-900">{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">NAV Projection</h2>
            <LineChart labels={yearLabels} series={navLineSeries} />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">HMRC Headroom Over Time</h2>
            <BarChart categories={yearLabels} series={headroomBarSeries} />
          </div>
        </div>

        {/* Projection Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm print:shadow-none print:border-gray-300">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">10-Year Projection Table</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {[
                    'Year', 'Opening NAV', 'Contributions', 'Benefits', 'Growth', 'Closing NAV',
                    'Proj. Loanbacks', 'Max Loanback', 'LB Headroom',
                    'Proj. Borrowing', 'Max Borrowing', 'Borrow Headroom',
                    'Proj. Employer Inv.', 'Max Emp. Inv.', 'Emp. Headroom',
                  ].map(h => (
                    <th key={h} className="text-left px-3 py-3 font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.year} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 font-bold text-gray-800">{r.year}</td>
                    <td className="px-3 py-2.5 text-gray-600">{fmtM(r.openingNAV)}</td>
                    <td className="px-3 py-2.5 text-emerald-600">{fmtM(r.contributions)}</td>
                    <td className="px-3 py-2.5 text-red-600">{fmtM(r.benefits)}</td>
                    <td className="px-3 py-2.5 text-blue-600">{fmtM(r.growth)}</td>
                    <td className="px-3 py-2.5 font-bold text-gray-900">{fmtM(r.closingNAV)}</td>
                    <td className="px-3 py-2.5 text-gray-700">{fmtM(r.projectedLoanbacks)}</td>
                    <td className="px-3 py-2.5 text-gray-500">{fmtM(r.hmrcMaxLoanback)}</td>
                    <td className={`px-3 py-2.5 font-semibold ${r.loanbackHeadroom < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtM(r.loanbackHeadroom)}</td>
                    <td className="px-3 py-2.5 text-gray-700">{fmtM(r.projectedBorrowing)}</td>
                    <td className="px-3 py-2.5 text-gray-500">{fmtM(r.hmrcMaxBorrowing)}</td>
                    <td className={`px-3 py-2.5 font-semibold ${r.borrowingHeadroom < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtM(r.borrowingHeadroom)}</td>
                    <td className="px-3 py-2.5 text-gray-700">{fmtM(r.projectedEmployer)}</td>
                    <td className="px-3 py-2.5 text-gray-500">{fmtM(r.hmrcMaxEmployer)}</td>
                    <td className={`px-3 py-2.5 font-semibold ${r.employerHeadroom < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtM(r.employerHeadroom)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-gray-100 flex gap-5 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Headroom breach (target exceeds HMRC limit)</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Headroom available</span>
          </div>
        </div>

        {/* Trustee Narrative */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-gray-300">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Trustee Narrative</h2>
          <p className="text-xs text-gray-400 mb-2 no-print">
            Summarise long-term utilisation strategy, expected HMRC headroom, and any planned changes to loanbacks, borrowing or employer-related investments.
          </p>
          <textarea
            value={draft.commentary}
            onChange={e => set('commentary', e.target.value)}
            rows={6}
            placeholder="Summarise long-term utilisation strategy, expected HMRC headroom, and any planned changes to loanbacks, borrowing or employer-related investments."
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
