import { useEffect, useState } from 'react';
import {
  PlusCircle, Trash2, Save, TrendingUp, TrendingDown, Scale,
  ChevronDown, ChevronUp, Info, BarChart3, History, Sliders, Link2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, NavAsset, NavLiability, NavHistoryRecord } from '../types';
import LineChart from '../components/LineChart';
import Modal from '../components/Modal';
import CurrencyInput from '../components/CurrencyInput';
import { fmt, fmtFull } from '../lib/format';

interface Props { scheme: SsasScheme; }

const ASSET_TYPES: NavAsset['asset_type'][] = [
  'Cash', 'Commercial Property', 'Loanback', 'Third-Party Loan', 'Deposit', 'Investment', 'Fund Investment', 'Other',
];
const LIABILITY_TYPES: NavLiability['liability_type'][] = [
  'Borrowing', 'Fees_Payable', 'Accruals', 'Other',
];

const liabilityLabel = (t: NavLiability['liability_type']) =>
  t === 'Fees_Payable' ? 'Fees Payable' : t;


type AssetDraft = Omit<NavAsset, 'id' | 'scheme_id' | 'created_at' | 'updated_at'>;
type LiabilityDraft = Omit<NavLiability, 'id' | 'scheme_id' | 'created_at' | 'updated_at'>;
type HistoryDraft = Omit<NavHistoryRecord, 'id' | 'scheme_id' | 'created_at'>;

interface AutoAssetRow {
  id: string;
  asset_type: NavAsset['asset_type'];
  description: string;
  market_value: number;
  valuation_date: string;
  source: string;
}

interface AutoLiabilityRow {
  id: string;
  liability_type: NavLiability['liability_type'];
  description: string;
  amount: number;
  due_date: string | null;
  source: string;
}

const emptyAsset = (): AssetDraft => ({
  asset_type: 'Other',
  description: '',
  market_value: 0,
  valuation_date: new Date().toISOString().split('T')[0],
  source: '',
});

const emptyLiability = (): LiabilityDraft => ({
  liability_type: 'Other',
  description: '',
  amount: 0,
  due_date: null,
});

const emptyHistory = (nav: number, assets: number, liabilities: number): HistoryDraft => ({
  snapshot_date: new Date().toISOString().split('T')[0],
  total_assets: assets,
  total_liabilities: liabilities,
  net_asset_value: nav,
});

export default function NavTracker({ scheme }: Props) {
  const [manualAssets, setManualAssets] = useState<NavAsset[]>([]);
  const [manualLiabilities, setManualLiabilities] = useState<NavLiability[]>([]);
  const [autoAssets, setAutoAssets] = useState<AutoAssetRow[]>([]);
  const [autoLiabilities, setAutoLiabilities] = useState<AutoLiabilityRow[]>([]);
  const [history, setHistory] = useState<NavHistoryRecord[]>([]);
  const [borrowingRegisterRows, setBorrowingRegisterRows] = useState<{
    id: string; lender_name: string; loan_amount: number; interest_rate: number;
    outstanding_balance: number; repayment_date: string | null; purpose: string;
  }[]>([]);

  const [assetModal, setAssetModal] = useState<{ mode: 'add' | 'edit'; draft: AssetDraft; id?: string } | null>(null);
  const [liabilityModal, setLiabilityModal] = useState<{ mode: 'add' | 'edit'; draft: LiabilityDraft; id?: string } | null>(null);
  const [historyModal, setHistoryModal] = useState<{ mode: 'add'; draft: HistoryDraft } | null>(null);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [useScenario, setUseScenario] = useState(false);
  const [scenarioAssetAdj, setScenarioAssetAdj] = useState(0);
  const [scenarioLiabilityAdj, setScenarioLiabilityAdj] = useState(0);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { loadAll(); }, [scheme.id]);

  async function loadAll() {
    setLoading(true);
    const [
      manAssets, manLiabilities, hist,
      properties, loanbacks, thirdPartyLoans, employerInvestments, borrowings, fundInvestments,
    ] = await Promise.all([
      supabase.from('nav_assets').select('*').eq('scheme_id', scheme.id).order('created_at'),
      supabase.from('nav_liabilities').select('*').eq('scheme_id', scheme.id).order('created_at'),
      supabase.from('nav_history').select('*').eq('scheme_id', scheme.id).order('snapshot_date'),
      supabase.from('property_register').select('id, property_name, current_value, purchase_date').eq('scheme_id', scheme.id),
      supabase.from('loanback_register').select('id, employer_name, outstanding_balance, loan_date').eq('scheme_id', scheme.id),
      supabase.from('third_party_loans').select('id, borrower_name, outstanding_balance, loan_date').eq('scheme_id', scheme.id),
      supabase.from('employer_related_investments').select('id, employer_name, investment_type, amount, investment_date').eq('scheme_id', scheme.id),
      supabase.from('borrowing_register').select('id, lender_name, loan_amount, interest_rate, outstanding_balance, repayment_date, purpose').eq('scheme_id', scheme.id).order('created_at'),
      supabase.from('fund_investments').select('id, fund_name, fund_manager, fund_type, current_value, investment_date').eq('scheme_id', scheme.id),
    ]);

    if (manAssets.data) setManualAssets(manAssets.data);
    if (manLiabilities.data) setManualLiabilities(manLiabilities.data);
    if (hist.data) setHistory(hist.data);

    // Build auto asset rows
    const derived: AutoAssetRow[] = [];

    // Cash balance from scheme
    if (scheme.cash_balance > 0) {
      derived.push({
        id: 'cash-balance',
        asset_type: 'Cash',
        description: 'SSAS Cash Balance',
        market_value: scheme.cash_balance,
        valuation_date: today,
        source: 'Scheme Cash Balance',
      });
    }

    (properties.data ?? []).forEach(p => {
      derived.push({
        id: `prop-${p.id}`,
        asset_type: 'Commercial Property',
        description: p.property_name,
        market_value: p.current_value ?? 0,
        valuation_date: p.purchase_date ?? today,
        source: 'Property Register',
      });
    });

    (loanbacks.data ?? []).forEach(l => {
      derived.push({
        id: `lb-${l.id}`,
        asset_type: 'Loanback',
        description: l.employer_name,
        market_value: l.outstanding_balance ?? 0,
        valuation_date: l.loan_date ?? today,
        source: 'Loanback Register',
      });
    });

    (thirdPartyLoans.data ?? []).forEach(t => {
      derived.push({
        id: `tpl-${t.id}`,
        asset_type: 'Third-Party Loan',
        description: t.borrower_name,
        market_value: t.outstanding_balance ?? 0,
        valuation_date: t.loan_date ?? today,
        source: 'Third-Party Loans',
      });
    });

    (employerInvestments.data ?? []).forEach(e => {
      derived.push({
        id: `eri-${e.id}`,
        asset_type: 'Investment',
        description: `${e.employer_name}${e.investment_type ? ` — ${e.investment_type}` : ''}`,
        market_value: e.amount ?? 0,
        valuation_date: e.investment_date ?? today,
        source: 'Employer Investments',
      });
    });

    (fundInvestments.data ?? []).forEach(f => {
      derived.push({
        id: `fund-${f.id}`,
        asset_type: 'Fund Investment',
        description: `${f.fund_name || f.fund_manager}${f.fund_type ? ` — ${f.fund_type}` : ''}`,
        market_value: f.current_value ?? 0,
        valuation_date: f.investment_date ?? today,
        source: 'Fund Investments',
      });
    });

    setAutoAssets(derived);

    // Build auto liability rows
    const derivedLiabilities: AutoLiabilityRow[] = (borrowings.data ?? []).map(b => ({
      id: `borrow-${b.id}`,
      liability_type: 'Borrowing' as const,
      description: b.lender_name,
      amount: b.outstanding_balance ?? 0,
      due_date: b.repayment_date ?? null,
      source: 'Borrowing Register',
    }));

    setAutoLiabilities(derivedLiabilities);

    setBorrowingRegisterRows((borrowings.data ?? []).map(b => ({
      id: b.id,
      lender_name: b.lender_name,
      loan_amount: Number(b.loan_amount),
      interest_rate: Number(b.interest_rate),
      outstanding_balance: Number(b.outstanding_balance),
      repayment_date: b.repayment_date ?? null,
      purpose: b.purpose ?? '',
    })));
    setLoading(false);
  }

  const totalAutoAssets = autoAssets.reduce((s, a) => s + a.market_value, 0);
  const totalManualAssets = manualAssets.reduce((s, a) => s + a.market_value, 0);
  const totalAssets = totalAutoAssets + totalManualAssets;

  const totalAutoLiabilities = autoLiabilities.reduce((s, l) => s + l.amount, 0);
  const totalManualLiabilities = manualLiabilities.reduce((s, l) => s + l.amount, 0);
  const totalLiabilities = totalAutoLiabilities + totalManualLiabilities;

  const nav = totalAssets - totalLiabilities;
  const scenarioNav = nav + scenarioAssetAdj - scenarioLiabilityAdj;

  const maxLoanback = nav * 0.5;
  const maxBorrowing = nav * 0.5;
  const maxEri = nav * 0.2;

  const usedLoanback = autoAssets.filter(a => a.asset_type === 'Loanback').reduce((s, a) => s + a.market_value, 0);
  const usedBorrowing = totalAutoLiabilities;
  const usedEri = autoAssets.filter(a => a.asset_type === 'Investment').reduce((s, a) => s + a.market_value, 0);

  // --- Asset CRUD ---
  async function saveAsset() {
    if (!assetModal) return;
    setSaving(true);
    const { mode, draft, id } = assetModal;
    if (mode === 'add') {
      await supabase.from('nav_assets').insert({ ...draft, scheme_id: scheme.id });
    } else {
      await supabase.from('nav_assets').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', id!);
    }
    setSaving(false);
    setAssetModal(null);
    loadAll();
  }

  async function deleteAsset(id: string) {
    await supabase.from('nav_assets').delete().eq('id', id);
    loadAll();
  }

  // --- Liability CRUD ---
  async function saveLiability() {
    if (!liabilityModal) return;
    setSaving(true);
    const { mode, draft, id } = liabilityModal;
    if (mode === 'add') {
      await supabase.from('nav_liabilities').insert({ ...draft, scheme_id: scheme.id });
    } else {
      await supabase.from('nav_liabilities').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', id!);
    }
    setSaving(false);
    setLiabilityModal(null);
    loadAll();
  }

  async function deleteLiability(id: string) {
    await supabase.from('nav_liabilities').delete().eq('id', id);
    loadAll();
  }

  // --- History CRUD ---
  async function saveHistory() {
    if (!historyModal) return;
    setSaving(true);
    await supabase.from('nav_history').insert({ ...historyModal.draft, scheme_id: scheme.id });
    setSaving(false);
    setHistoryModal(null);
    loadAll();
  }

  async function deleteHistory(id: string) {
    await supabase.from('nav_history').delete().eq('id', id);
    loadAll();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-gray-400 text-sm">Loading NAV data…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">NAV Tracker</h1>
          <p className="text-sm text-gray-500 mt-0.5">{scheme.name}</p>
        </div>
      </div>

      {/* NAV Definition */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex gap-3">
        <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-900 mb-1">What is NAV?</p>
          <p className="text-sm text-blue-800 leading-relaxed">
            Net Asset Value (NAV) represents the total market value of all SSAS assets minus all SSAS liabilities.
            HMRC uses NAV to calculate the 50% loanback limit, 50% borrowing limit, and 5%/20% employer-related investment limits.
          </p>
        </div>
      </div>

      {/* Asset Register */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Asset Register</h2>
            <p className="text-xs text-gray-500 mt-0.5">Auto-populated from registers — add manual assets below</p>
          </div>
          <button
            onClick={() => setAssetModal({ mode: 'add', draft: emptyAsset() })}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            <PlusCircle size={15} /> Add Manual Asset
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Asset Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Market Value</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {autoAssets.length === 0 && manualAssets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400 text-sm">No assets found. Add records in the Property, Loanback, Third-Party Loans, or Employer Investments registers.</td>
                </tr>
              ) : (
                <>
                  {autoAssets.map((a, i) => (
                    <tr key={a.id} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-sky-50/30' : 'bg-sky-50/10'}`}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">{a.asset_type}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.description}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-sky-600 font-medium">
                          <Link2 size={10} /> {a.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{a.valuation_date}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtFull(a.market_value)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-gray-300 italic">auto</span>
                      </td>
                    </tr>
                  ))}
                  {manualAssets.map((a, i) => (
                    <tr key={a.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-medium">{a.asset_type}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.description || <span className="text-gray-400 italic">—</span>}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{a.source || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{a.valuation_date}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtFull(a.market_value)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setAssetModal({ mode: 'edit', draft: { asset_type: a.asset_type, description: a.description, market_value: a.market_value, valuation_date: a.valuation_date, source: a.source }, id: a.id })}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                          >
                            <Save size={13} />
                          </button>
                          <button onClick={() => deleteAsset(a.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
            {(autoAssets.length + manualAssets.length) > 0 && (
              <tfoot>
                {autoAssets.length > 0 && manualAssets.length > 0 && (
                  <tr className="border-t border-gray-100 bg-gray-50/60">
                    <td colSpan={4} className="px-4 py-2 text-xs text-gray-400">Register sources: {fmt(totalAutoAssets)} &nbsp;|&nbsp; Manual: {fmt(totalManualAssets)}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-700">Total Assets</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{fmtFull(totalAssets)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Liability Register */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Liability Register</h2>
            <p className="text-xs text-gray-500 mt-0.5">Auto-populated from Borrowing Register — add manual liabilities below</p>
          </div>
          <button
            onClick={() => setLiabilityModal({ mode: 'add', draft: emptyLiability() })}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            <PlusCircle size={15} /> Add Manual Liability
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {autoLiabilities.length === 0 && manualLiabilities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400 text-sm">No liabilities found. Add borrowings in the Borrowing Register.</td>
                </tr>
              ) : (
                <>
                  {autoLiabilities.map((l, i) => (
                    <tr key={l.id} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-rose-50/20' : ''}`}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-50 text-red-700 text-xs font-medium">{liabilityLabel(l.liability_type)}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{l.description}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-sky-600 font-medium">
                          <Link2 size={10} /> {l.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{l.due_date || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtFull(l.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-gray-300 italic">auto</span>
                      </td>
                    </tr>
                  ))}
                  {manualLiabilities.map((l, i) => (
                    <tr key={l.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-medium">{liabilityLabel(l.liability_type)}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{l.description || <span className="text-gray-400 italic">—</span>}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">Manual</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{l.due_date || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtFull(l.amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setLiabilityModal({ mode: 'edit', draft: { liability_type: l.liability_type, description: l.description, amount: l.amount, due_date: l.due_date }, id: l.id })}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                          >
                            <Save size={13} />
                          </button>
                          <button onClick={() => deleteLiability(l.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
            {(autoLiabilities.length + manualLiabilities.length) > 0 && (
              <tfoot>
                {autoLiabilities.length > 0 && manualLiabilities.length > 0 && (
                  <tr className="border-t border-gray-100 bg-gray-50/60">
                    <td colSpan={4} className="px-4 py-2 text-xs text-gray-400">Borrowing Register: {fmt(totalAutoLiabilities)} &nbsp;|&nbsp; Manual: {fmt(totalManualLiabilities)}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-700">Total Liabilities</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{fmtFull(totalLiabilities)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Borrowing Register */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Borrowing Register</h2>
            <p className="text-xs text-gray-500 mt-0.5">Auto-populated from Borrowing Register</p>
          </div>
          {borrowingRegisterRows.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Total Outstanding</p>
              <p className="text-sm font-bold text-gray-900">{fmt(borrowingRegisterRows.reduce((s, r) => s + r.outstanding_balance, 0))}</p>
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Lender</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Purpose</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Loan Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Repayment Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Outstanding</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {borrowingRegisterRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400 text-sm">No borrowing recorded. Add entries in the Borrowing Register.</td>
                </tr>
              ) : (
                borrowingRegisterRows.map((r, i) => (
                  <tr key={r.id} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-rose-50/20' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.lender_name}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{r.purpose || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-sky-600 font-medium">
                        <Link2 size={10} /> Borrowing Register
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtFull(r.loan_amount)}</td>
                    <td className="px-4 py-3 text-gray-700">{r.interest_rate.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{r.repayment_date || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtFull(r.outstanding_balance)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-gray-300 italic">auto</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {borrowingRegisterRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={6} className="px-4 py-3 text-sm font-bold text-gray-700">Total Outstanding</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                    {fmtFull(borrowingRegisterRows.reduce((s, r) => s + r.outstanding_balance, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* NAV Calculation */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">NAV Calculation</h2>
        <div className="grid grid-cols-3 gap-4">
          <NavCard
            icon={<TrendingUp size={20} className="text-emerald-600" />}
            label="Total Assets"
            value={fmtFull(totalAssets)}
            bg="bg-emerald-50"
            border="border-emerald-100"
          />
          <NavCard
            icon={<TrendingDown size={20} className="text-red-500" />}
            label="Total Liabilities"
            value={fmtFull(totalLiabilities)}
            bg="bg-red-50"
            border="border-red-100"
          />
          <div className="rounded-xl border-2 border-gray-900 bg-gray-900 p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-2">
              <Scale size={20} className="text-white" />
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Net Asset Value (NAV)</p>
            <p className={`text-2xl font-bold ${nav >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtFull(nav)}</p>
            <p className="text-xs text-gray-500">{fmt(totalAssets)} assets − {fmt(totalLiabilities)} liabilities</p>
          </div>
        </div>
      </section>

      {/* HMRC Capacity */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">HMRC Capacity</h2>
        <div className="grid grid-cols-3 gap-4">
          <CapacityCard title="Loanback Capacity" subtitle="50% of NAV" max={maxLoanback} remaining={maxLoanback - usedLoanback} color="blue" />
          <CapacityCard title="Borrowing Capacity" subtitle="50% of NAV" max={maxBorrowing} remaining={maxBorrowing - usedBorrowing} color="amber" />
          <CapacityCard title="Employer-Related Investment" subtitle="20% of NAV" max={maxEri} remaining={maxEri - usedEri} color="teal" />
        </div>
      </section>

      {/* NAV History */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">NAV Over Time</h2>
            <p className="text-xs text-gray-500 mt-0.5">Periodic snapshots for trend analysis</p>
          </div>
          <button
            onClick={() => setHistoryModal({ mode: 'add', draft: emptyHistory(nav, totalAssets, totalLiabilities) })}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            <History size={15} /> Save Snapshot
          </button>
        </div>

        {history.length > 1 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <LineChart
              labels={history.map(h => h.snapshot_date)}
              series={[
                { name: 'Net Asset Value', color: '#0ea5e9', values: history.map(h => h.net_asset_value) },
                { name: 'Total Assets', color: '#10b981', values: history.map(h => h.total_assets), dashed: true },
                { name: 'Total Liabilities', color: '#ef4444', values: history.map(h => h.total_liabilities), dashed: true },
              ]}
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 text-gray-400">
              <BarChart3 size={20} />
              <p className="text-sm">Save at least 2 snapshots to see the NAV trend chart.</p>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-4 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Assets</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Liabilities</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">NAV</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id} className={`border-b border-gray-50 hover:bg-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                    <td className="px-4 py-3 text-gray-700">{h.snapshot_date}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtFull(h.total_assets)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtFull(h.total_liabilities)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${h.net_asset_value >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmtFull(h.net_asset_value)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => deleteHistory(h.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Scenario NAV */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Scenario NAV</h2>
          <button
            onClick={() => setUseScenario(v => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${useScenario ? 'bg-gray-900' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${useScenario ? 'translate-x-4' : 'translate-x-1'}`} />
          </button>
          <span className="text-sm text-gray-500">{useScenario ? 'Enabled' : 'Disabled'}</span>
        </div>

        {useScenario && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  <Sliders size={12} className="inline mr-1" /> Asset Adjustment (+)
                </label>
                <CurrencyInput value={scenarioAssetAdj} onChange={setScenarioAssetAdj} />
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  <Sliders size={12} className="inline mr-1" /> Liability Adjustment (+)
                </label>
                <CurrencyInput value={scenarioLiabilityAdj} onChange={setScenarioLiabilityAdj} />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-900 rounded-xl p-5 col-span-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Scenario NAV</p>
                <p className={`text-xl font-bold ${scenarioNav >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtFull(scenarioNav)}</p>
              </div>
              <NavCard label="Scenario Loanback" value={fmtFull(scenarioNav * 0.5)} bg="bg-blue-50" border="border-blue-100" icon={<ChevronUp size={18} className="text-blue-600" />} />
              <NavCard label="Scenario Borrowing" value={fmtFull(scenarioNav * 0.5)} bg="bg-amber-50" border="border-amber-100" icon={<ChevronDown size={18} className="text-amber-600" />} />
              <NavCard label="Scenario ERI" value={fmtFull(scenarioNav * 0.2)} bg="bg-teal-50" border="border-teal-100" icon={<TrendingUp size={18} className="text-teal-600" />} />
            </div>
          </div>
        )}
      </section>

      {/* Asset Modal */}
      {assetModal && (
        <Modal title={assetModal.mode === 'add' ? 'Add Manual Asset' : 'Edit Asset'} onClose={() => setAssetModal(null)}>
          <div className="space-y-4 p-1">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Asset Type</label>
              <select
                value={assetModal.draft.asset_type}
                onChange={e => setAssetModal(m => m && { ...m, draft: { ...m.draft, asset_type: e.target.value as NavAsset['asset_type'] } })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {ASSET_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
              <input
                value={assetModal.draft.description}
                onChange={e => setAssetModal(m => m && { ...m, draft: { ...m.draft, description: e.target.value } })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="e.g. Bank deposit account"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Market Value</label>
                <CurrencyInput
                  value={assetModal.draft.market_value}
                  onChange={v => setAssetModal(m => m && { ...m, draft: { ...m.draft, market_value: v } })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valuation Date</label>
                <input
                  type="date"
                  value={assetModal.draft.valuation_date}
                  onChange={e => setAssetModal(m => m && { ...m, draft: { ...m.draft, valuation_date: e.target.value } })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Source / Notes</label>
              <input
                value={assetModal.draft.source}
                onChange={e => setAssetModal(m => m && { ...m, draft: { ...m.draft, source: e.target.value } })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="e.g. Cash balance per bank statement"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAssetModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors">Cancel</button>
              <button onClick={saveAsset} disabled={saving} className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Asset'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Liability Modal */}
      {liabilityModal && (
        <Modal title={liabilityModal.mode === 'add' ? 'Add Manual Liability' : 'Edit Liability'} onClose={() => setLiabilityModal(null)}>
          <div className="space-y-4 p-1">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Liability Type</label>
              <select
                value={liabilityModal.draft.liability_type}
                onChange={e => setLiabilityModal(m => m && { ...m, draft: { ...m.draft, liability_type: e.target.value as NavLiability['liability_type'] } })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {LIABILITY_TYPES.map(t => <option key={t} value={t}>{liabilityLabel(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
              <input
                value={liabilityModal.draft.description}
                onChange={e => setLiabilityModal(m => m && { ...m, draft: { ...m.draft, description: e.target.value } })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="e.g. Outstanding scheme management fees"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Amount</label>
                <CurrencyInput
                  value={liabilityModal.draft.amount}
                  onChange={v => setLiabilityModal(m => m && { ...m, draft: { ...m.draft, amount: v } })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due Date</label>
                <input
                  type="date"
                  value={liabilityModal.draft.due_date ?? ''}
                  onChange={e => setLiabilityModal(m => m && { ...m, draft: { ...m.draft, due_date: e.target.value || null } })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setLiabilityModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors">Cancel</button>
              <button onClick={saveLiability} disabled={saving} className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Liability'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* History Modal */}
      {historyModal && (
        <Modal title="Save NAV Snapshot" onClose={() => setHistoryModal(null)}>
          <div className="space-y-4 p-1">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Snapshot Date</label>
              <input
                type="date"
                value={historyModal.draft.snapshot_date}
                onChange={e => setHistoryModal(m => m && { ...m, draft: { ...m.draft, snapshot_date: e.target.value } })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Assets</label>
                <CurrencyInput
                  value={historyModal.draft.total_assets}
                  onChange={v => setHistoryModal(m => m && { ...m, draft: { ...m.draft, total_assets: v, net_asset_value: v - m.draft.total_liabilities } })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Liabilities</label>
                <CurrencyInput
                  value={historyModal.draft.total_liabilities}
                  onChange={v => setHistoryModal(m => m && { ...m, draft: { ...m.draft, total_liabilities: v, net_asset_value: m.draft.total_assets - v } })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">NAV</label>
                <CurrencyInput
                  value={historyModal.draft.net_asset_value}
                  onChange={v => setHistoryModal(m => m && { ...m, draft: { ...m.draft, net_asset_value: v } })}
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">Pre-filled from current register values — edit if needed.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setHistoryModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors">Cancel</button>
              <button onClick={saveHistory} disabled={saving} className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Snapshot'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- Sub-components ---

interface NavCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg: string;
  border: string;
}

function NavCard({ icon, label, value, bg, border }: NavCardProps) {
  return (
    <div className={`rounded-xl border ${border} ${bg} p-5 flex flex-col gap-1`}>
      <div className="mb-2">{icon}</div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

interface CapacityCardProps {
  title: string;
  subtitle: string;
  max: number;
  remaining: number;
  color: 'blue' | 'amber' | 'teal';
}

const colorMap = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-100', bar: 'bg-blue-500', text: 'text-blue-700', label: 'text-blue-600' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-100', bar: 'bg-amber-500', text: 'text-amber-700', label: 'text-amber-600' },
  teal: { bg: 'bg-teal-50', border: 'border-teal-100', bar: 'bg-teal-500', text: 'text-teal-700', label: 'text-teal-600' },
};

function CapacityCard({ title, subtitle, max, remaining, color }: CapacityCardProps) {
  const c = colorMap[color];
  const pct = max > 0 ? Math.min((remaining / max) * 100, 100) : 0;
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5`}>
      <p className={`text-xs font-semibold ${c.label} uppercase tracking-wide mb-1`}>{subtitle}</p>
      <p className="text-sm font-bold text-gray-900 mb-3">{title}</p>
      <p className={`text-2xl font-bold ${c.text} mb-1`}>{fmt(max)}</p>
      <p className="text-xs text-gray-500 mb-3">Maximum allowable</p>
      <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
        <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500 mt-2">Remaining: {fmt(remaining)}</p>
    </div>
  );
}
