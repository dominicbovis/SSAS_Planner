import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, Check, ChevronDown, ChevronUp, X, ArrowDownCircle, ArrowUpCircle, Building2, TrendingUp, AlertTriangle, Lightbulb, Zap, Pencil, CalendarClock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, ScenarioRecord, ScenarioAction, ScenarioActionType, PendingTransfer } from '../types';
import GaugeChart from '../components/GaugeChart';
import BarChart from '../components/BarChart';
import CashWaterfallChart, { WaterfallStep } from '../components/CashWaterfallChart';
import { fmt, fmtFull } from '../lib/format';

// ─── Action metadata ────────────────────────────────────────────────────────

interface ActionMeta {
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  affects: string[];
}

const ACTION_META: Record<ScenarioActionType, ActionMeta> = {
  property_purchase: {
    label: 'Property Purchase',
    icon: <Building2 size={14} />,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    description: 'Buy commercial property into the scheme. Reduces cash; NAV stays neutral (cash swaps for property).',
    affects: ['↓ Cash'],
  },
  loanback: {
    label: 'New Loanback',
    icon: <ArrowUpCircle size={14} />,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    description: 'Lend scheme funds to a member company. Increases loanback balance; reduces cash.',
    affects: ['↑ Loanback balance', '↓ Cash'],
  },
  repay_loanback: {
    label: 'Repay Loanback',
    icon: <ArrowDownCircle size={14} />,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Member company repays outstanding loanback. Reduces loanback balance; increases cash.',
    affects: ['↓ Loanback balance', '↑ Cash'],
  },
  borrow: {
    label: 'New Borrowing',
    icon: <ArrowUpCircle size={14} />,
    color: 'bg-red-50 text-red-700 border-red-200',
    description: 'Scheme takes on external borrowing. Increases borrowing balance and cash.',
    affects: ['↑ Borrowing balance', '↑ Cash'],
  },
  repay_borrowing: {
    label: 'Repay Borrowing',
    icon: <ArrowDownCircle size={14} />,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Repay outstanding borrowing. Reduces borrowing balance.',
    affects: ['↓ Borrowing balance'],
  },
  employer_investment: {
    label: 'Employer Investment',
    icon: <TrendingUp size={14} />,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    description: 'Invest in employer-related assets. Increases employer investment balance.',
    affects: ['↑ Employer investment balance'],
  },
  cash_in: {
    label: 'Cash In',
    icon: <ArrowDownCircle size={14} />,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Additional cash received (e.g. contributions, rental income).',
    affects: ['↑ Cash', '↑ NAV'],
  },
  cash_out: {
    label: 'Cash Out',
    icon: <ArrowUpCircle size={14} />,
    color: 'bg-gray-50 text-gray-700 border-gray-200',
    description: 'Cash leaves the scheme (e.g. expenses, benefits paid).',
    affects: ['↓ Cash', '↓ NAV'],
  },
};

// ─── Adjustments maths ───────────────────────────────────────────────────────

function actionToAdjustments(action: ScenarioAction): {
  navDelta: number; loanbackDelta: number; borrowingDelta: number; employerDelta: number; cashDelta: number;
} {
  const amt = Number(action.amount);
  switch (action.action_type) {
    case 'property_purchase':
      return { navDelta: 0, loanbackDelta: 0, borrowingDelta: 0, employerDelta: 0, cashDelta: -amt };
    case 'loanback':
      return { navDelta: 0, loanbackDelta: amt, borrowingDelta: 0, employerDelta: 0, cashDelta: -amt };
    case 'repay_loanback':
      return { navDelta: 0, loanbackDelta: -amt, borrowingDelta: 0, employerDelta: 0, cashDelta: amt };
    case 'borrow':
      return { navDelta: amt, loanbackDelta: 0, borrowingDelta: amt, employerDelta: 0, cashDelta: amt };
    case 'repay_borrowing':
      return { navDelta: -amt, loanbackDelta: 0, borrowingDelta: -amt, employerDelta: 0, cashDelta: -amt };
    case 'employer_investment':
      return { navDelta: 0, loanbackDelta: 0, borrowingDelta: 0, employerDelta: amt, cashDelta: -amt };
    case 'cash_in':
      return { navDelta: amt, loanbackDelta: 0, borrowingDelta: 0, employerDelta: 0, cashDelta: amt };
    case 'cash_out':
      return { navDelta: -amt, loanbackDelta: 0, borrowingDelta: 0, employerDelta: 0, cashDelta: -amt };
    default:
      return { navDelta: 0, loanbackDelta: 0, borrowingDelta: 0, employerDelta: 0, cashDelta: 0 };
  }
}

function deriveAdjustments(actions: ScenarioAction[], baseNav: number, transfers: PendingTransfer[] = []) {
  let navDelta = 0, loanbackDelta = 0, borrowingDelta = 0, employerDelta = 0, cashDelta = 0;
  for (const a of actions) {
    const d = actionToAdjustments(a);
    navDelta += d.navDelta;
    loanbackDelta += d.loanbackDelta;
    borrowingDelta += d.borrowingDelta;
    employerDelta += d.employerDelta;
    cashDelta += d.cashDelta;
  }
  for (const t of transfers) {
    const amt = Number(t.amount);
    cashDelta += amt;
    navDelta += amt;
  }
  const navAdjPct = baseNav > 0 ? (navDelta / baseNav) * 100 : 0;
  return { navDelta, navAdjPct, loanbackDelta, borrowingDelta, employerDelta, cashDelta };
}

// ─── Issue diagnosis ─────────────────────────────────────────────────────────

interface ScenarioIssue {
  severity: 'error' | 'warning';
  title: string;
  detail: string;
  suggestion: SuggestedFix | null;
}

interface SuggestedFix {
  label: string;
  action_type: ScenarioActionType;
  amount: number;
  actionLabel: string;
  counterparty: string;
  notes: string;
}

interface ScenarioPositions {
  cash: number;
  nav: number;
  loanbacks: number;
  borrowing: number;
  employer: number;
  baseCash: number;
  baseNav: number;
  baseLoanbacks: number;
  baseBorrowing: number;
  baseEmployer: number;
}

function diagnoseIssues(pos: ScenarioPositions): ScenarioIssue[] {
  const issues: ScenarioIssue[] = [];
  const maxLoanback = 0.5 * pos.nav;
  const maxBorrowing = 0.5 * pos.nav;
  const maxEmployer = 0.20 * pos.nav;
  const maxBorrowingHeadroom = maxBorrowing - pos.borrowing;

  // Cash goes negative
  if (pos.cash < 0) {
    const shortfall = Math.abs(pos.cash);
    // Can borrowing cover the shortfall without breaching 50% NAV limit?
    const canBorrow = maxBorrowingHeadroom >= shortfall;
    issues.push({
      severity: 'error',
      title: 'Cash position goes negative',
      detail: `Scenario cash falls to ${fmtFull(pos.cash)}, a shortfall of ${fmtFull(shortfall)}. The scheme cannot complete these transactions without additional funding.`,
      suggestion: canBorrow
        ? {
            label: `Add borrowing of ${fmtFull(shortfall)} to cover the shortfall`,
            action_type: 'borrow',
            amount: shortfall,
            actionLabel: `Borrowing to fund cash shortfall`,
            counterparty: '',
            notes: `Auto-suggested to cover ${fmtFull(shortfall)} cash shortfall from scenario actions`,
          }
        : {
            label: `Add member contribution (Cash In) of ${fmtFull(shortfall)} to cover the shortfall`,
            action_type: 'cash_in',
            amount: shortfall,
            actionLabel: `Member contribution to fund cash shortfall`,
            counterparty: '',
            notes: `Auto-suggested: borrowing headroom insufficient (${fmtFull(maxBorrowingHeadroom)} available vs ${fmtFull(shortfall)} needed)`,
          },
    });
  } else if (pos.cash < pos.baseCash * 0.1 && pos.baseCash > 0) {
    // Cash falls to under 10% of base — warn
    issues.push({
      severity: 'warning',
      title: 'Cash reserves critically low',
      detail: `Scenario cash is ${fmtFull(pos.cash)}, only ${((pos.cash / pos.baseCash) * 100).toFixed(1)}% of the current balance. Consider maintaining a liquidity buffer.`,
      suggestion: null,
    });
  }

  // Loanback breach
  if (pos.loanbacks > maxLoanback) {
    const excess = pos.loanbacks - maxLoanback;
    issues.push({
      severity: 'error',
      title: 'Loanback limit breached',
      detail: `Scenario loanbacks of ${fmtFull(pos.loanbacks)} exceed the 50% NAV limit of ${fmtFull(maxLoanback)} by ${fmtFull(excess)}.`,
      suggestion: {
        label: `Reduce loanback by ${fmtFull(excess)} (partial repayment)`,
        action_type: 'repay_loanback',
        amount: excess,
        actionLabel: `Partial loanback repayment to restore compliance`,
        counterparty: '',
        notes: `Auto-suggested to bring loanbacks within the 50% NAV limit`,
      },
    });
  } else if (pos.loanbacks > maxLoanback * 0.9) {
    const headroom = maxLoanback - pos.loanbacks;
    issues.push({
      severity: 'warning',
      title: 'Loanback limit approaching',
      detail: `Scenario loanbacks are ${((pos.loanbacks / maxLoanback) * 100).toFixed(1)}% of the 50% NAV limit with only ${fmtFull(headroom)} headroom remaining.`,
      suggestion: null,
    });
  }

  // Borrowing breach
  if (pos.borrowing > maxBorrowing) {
    const excess = pos.borrowing - maxBorrowing;
    issues.push({
      severity: 'error',
      title: 'Borrowing limit breached',
      detail: `Scenario borrowing of ${fmtFull(pos.borrowing)} exceeds the 50% NAV limit of ${fmtFull(maxBorrowing)} by ${fmtFull(excess)}.`,
      suggestion: {
        label: `Repay ${fmtFull(excess)} of borrowing to restore compliance`,
        action_type: 'repay_borrowing',
        amount: excess,
        actionLabel: `Partial borrowing repayment to restore compliance`,
        counterparty: '',
        notes: `Auto-suggested to bring borrowing within the 50% NAV limit`,
      },
    });
  } else if (pos.borrowing > maxBorrowing * 0.9) {
    const headroom = maxBorrowing - pos.borrowing;
    issues.push({
      severity: 'warning',
      title: 'Borrowing limit approaching',
      detail: `Scenario borrowing is ${((pos.borrowing / maxBorrowing) * 100).toFixed(1)}% of the 50% NAV limit with only ${fmtFull(headroom)} headroom remaining.`,
      suggestion: null,
    });
  }

  // Employer investment breach
  if (pos.employer > maxEmployer) {
    const excess = pos.employer - maxEmployer;
    issues.push({
      severity: 'error',
      title: 'Employer investment limit breached',
      detail: `Scenario employer investments of ${fmtFull(pos.employer)} exceed the 20% NAV limit of ${fmtFull(maxEmployer)} by ${fmtFull(excess)}.`,
      suggestion: null,
    });
  } else if (pos.employer > maxEmployer * 0.9) {
    const headroom = maxEmployer - pos.employer;
    issues.push({
      severity: 'warning',
      title: 'Employer investment limit approaching',
      detail: `Scenario employer investments are ${((pos.employer / maxEmployer) * 100).toFixed(1)}% of the 20% NAV limit with only ${fmtFull(headroom)} headroom remaining.`,
      suggestion: null,
    });
  }

  return issues;
}

// ─── Issue banner component ──────────────────────────────────────────────────

interface IssueBannerProps {
  issues: ScenarioIssue[];
  onApplyFix: (fix: SuggestedFix) => void;
}

function IssueBanner({ issues, onApplyFix }: IssueBannerProps) {
  if (issues.length === 0) return null;

  return (
    <div className="space-y-2">
      {issues.map((issue, i) => {
        const isError = issue.severity === 'error';
        return (
          <div
            key={i}
            className={`rounded-xl border px-4 py-3.5 ${isError ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 shrink-0 ${isError ? 'text-red-500' : 'text-amber-500'}`}>
                <AlertTriangle size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${isError ? 'text-red-800' : 'text-amber-800'}`}>{issue.title}</p>
                <p className={`text-xs mt-0.5 ${isError ? 'text-red-700' : 'text-amber-700'}`}>{issue.detail}</p>
                {issue.suggestion && (
                  <div className={`mt-2.5 flex items-start gap-2.5 rounded-lg border p-2.5 ${isError ? 'bg-white border-red-200' : 'bg-white border-amber-200'}`}>
                    <Lightbulb size={13} className={`mt-0.5 shrink-0 ${isError ? 'text-red-400' : 'text-amber-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${isError ? 'text-red-800' : 'text-amber-800'}`}>
                        Suggested fix: {issue.suggestion.label}
                      </p>
                    </div>
                    <button
                      onClick={() => onApplyFix(issue.suggestion!)}
                      className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${isError ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
                    >
                      <Zap size={11} />
                      Apply fix
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Local text input ────────────────────────────────────────────────────────

function LocalTextInput({ value, onCommit, className = '', placeholder = '' }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) { setText(value); committed.current = value; }
  }, [value]);
  return (
    <input type="text" value={text} placeholder={placeholder}
      onChange={e => setText(e.target.value)}
      onBlur={() => { committed.current = text; onCommit(text); }}
      className={className} />
  );
}

// ─── Action form ─────────────────────────────────────────────────────────────

interface ActionFormState {
  action_type: ScenarioActionType;
  label: string;
  counterparty: string;
  amount: string;
  notes: string;
}

const EMPTY_FORM: ActionFormState = {
  action_type: 'property_purchase',
  label: '',
  counterparty: '',
  amount: '',
  notes: '',
};

function ActionForm({ onSave, onCancel }: { onSave: (f: ActionFormState) => void; onCancel: () => void }) {
  const [form, setForm] = useState<ActionFormState>(EMPTY_FORM);
  const meta = ACTION_META[form.action_type];

  function set<K extends keyof ActionFormState>(k: K, v: ActionFormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-gray-50 p-4 space-y-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">New Action</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(Object.keys(ACTION_META) as ScenarioActionType[]).map(t => {
          const m = ACTION_META[t];
          const active = form.action_type === t;
          return (
            <button key={t} onClick={() => set('action_type', t)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${active ? m.color + ' ring-1 ring-current' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
              {m.icon}{m.label}
            </button>
          );
        })}
      </div>

      <div className={`rounded-lg border px-3 py-2 text-xs ${meta.color}`}>
        <span className="font-medium">{meta.label}: </span>{meta.description}
        <span className="ml-2 opacity-70">{meta.affects.join(' · ')}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Description <span className="text-red-500">*</span></label>
          <input type="text" value={form.label} onChange={e => set('label', e.target.value)}
            placeholder="e.g. Purchase building from RHHL"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Counterparty</label>
          <input type="text" value={form.counterparty} onChange={e => set('counterparty', e.target.value)}
            placeholder="e.g. RHHL, Barclays"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Amount (£) <span className="text-red-500">*</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">£</span>
            <input type="text" inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)}
              placeholder="200000"
              className="w-full pl-7 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Optional additional context"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white" />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => onSave(form)} disabled={!form.label || !form.amount}
          className="px-4 py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Add Action
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Gauge helper ────────────────────────────────────────────────────────────

function gaugeColor(value: number, max: number): 'red' | 'amber' | 'green' {
  if (value > max) return 'red';
  if (value > max * 0.9) return 'amber';
  return 'green';
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props { scheme: SsasScheme; }
interface Totals { loanbacks: number; borrowing: number; employer: number; }

export default function Scenarios({ scheme }: Props) {
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [actions, setActions] = useState<Record<string, ScenarioAction[]>>({});
  const [totals, setTotals] = useState<Totals>({ loanbacks: 0, borrowing: 0, employer: 0 });
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showDescFor, setShowDescFor] = useState<Record<string, boolean>>({});
  const [showFormFor, setShowFormFor] = useState<string | null>(null);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ label: string; counterparty: string; amount: string; notes: string }>({ label: '', counterparty: '', amount: '', notes: '' });
  const [transfers, setTransfers] = useState<Record<string, PendingTransfer[]>>({});
  const [showTransferFormFor, setShowTransferFormFor] = useState<string | null>(null);
  const [transferDraft, setTransferDraft] = useState<{ description: string; source: string; amount: string; expected_date: string }>({ description: '', source: '', amount: '', expected_date: '' });

  const nav = Number(scheme.net_asset_value);
  const cash = Number(scheme.cash_balance);

  // All scenarios currently toggled on — stacked together
  const activeScenarios = scenarios.filter(s => s.is_active);

  const load = useCallback(async () => {
    const [{ data: sc }, lb, borrow, emp, { data: acts }, { data: trans }] = await Promise.all([
      supabase.from('scenarios').select('*').eq('scheme_id', scheme.id).order('created_at'),
      supabase.from('loanback_register').select('outstanding_balance').eq('scheme_id', scheme.id),
      supabase.from('borrowing_register').select('outstanding_balance').eq('scheme_id', scheme.id),
      supabase.from('employer_related_investments').select('amount').eq('scheme_id', scheme.id),
      supabase.from('scenario_actions').select('*').eq('scheme_id', scheme.id).order('created_at'),
      supabase.from('pending_transfers').select('*').eq('scheme_id', scheme.id).order('expected_date'),
    ]);
    setScenarios(sc ?? []);
    setTotals({
      loanbacks: (lb.data ?? []).reduce((s, r) => s + Number(r.outstanding_balance), 0),
      borrowing: (borrow.data ?? []).reduce((s, r) => s + Number(r.outstanding_balance), 0),
      employer: (emp.data ?? []).reduce((s, r) => s + Number(r.amount), 0),
    });
    const byScenario: Record<string, ScenarioAction[]> = {};
    for (const a of (acts ?? [])) {
      if (!byScenario[a.scenario_id]) byScenario[a.scenario_id] = [];
      byScenario[a.scenario_id].push(a);
    }
    setActions(byScenario);
    const transfersByScenario: Record<string, PendingTransfer[]> = {};
    for (const t of (trans ?? [])) {
      if (!transfersByScenario[t.scenario_id]) transfersByScenario[t.scenario_id] = [];
      transfersByScenario[t.scenario_id].push(t);
    }
    setTransfers(transfersByScenario);
  }, [scheme.id]);

  useEffect(() => { load(); }, [load]);

  async function addScenario() {
    const { data } = await supabase.from('scenarios').insert({
      scheme_id: scheme.id,
      scenario_name: `Scenario ${scenarios.length + 1}`,
      description: '',
      nav_adjustment_pct: 0,
      loanback_adjustment: 0,
      borrowing_adjustment: 0,
      employer_investment_adjustment: 0,
      is_active: false,
    }).select().single();
    if (data) setScenarios(s => [...s, data]);
  }

  async function updateScenarioName(id: string, scenario_name: string) {
    await supabase.from('scenarios').update({ scenario_name }).eq('id', id);
    setScenarios(s => s.map(sc => sc.id === id ? { ...sc, scenario_name } : sc));
  }

  async function updateScenarioDesc(id: string, description: string) {
    await supabase.from('scenarios').update({ description }).eq('id', id);
    setScenarios(s => s.map(sc => sc.id === id ? { ...sc, description } : sc));
  }

  async function syncAdjustments(scenarioId: string, updatedActions: ScenarioAction[], updatedTransfers?: PendingTransfer[]) {
    const adj = deriveAdjustments(updatedActions, nav, updatedTransfers ?? transfers[scenarioId] ?? []);
    await supabase.from('scenarios').update({
      nav_adjustment_pct: adj.navAdjPct,
      loanback_adjustment: adj.loanbackDelta,
      borrowing_adjustment: adj.borrowingDelta,
      employer_investment_adjustment: adj.employerDelta,
    }).eq('id', scenarioId);
  }

  async function addTransfer(scenarioId: string) {
    const amt = parseFloat(transferDraft.amount.replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) return;
    const { data } = await supabase.from('pending_transfers').insert({
      scenario_id: scenarioId,
      scheme_id: scheme.id,
      description: transferDraft.description,
      source: transferDraft.source,
      amount: amt,
      expected_date: transferDraft.expected_date || null,
    }).select().single();
    if (!data) return;
    const updated = [...(transfers[scenarioId] ?? []), data];
    setTransfers(prev => ({ ...prev, [scenarioId]: updated }));
    await syncAdjustments(scenarioId, actions[scenarioId] ?? [], updated);
    setShowTransferFormFor(null);
    setTransferDraft({ description: '', source: '', amount: '', expected_date: '' });
  }

  async function removeTransfer(scenarioId: string, transferId: string) {
    await supabase.from('pending_transfers').delete().eq('id', transferId);
    const updated = (transfers[scenarioId] ?? []).filter(t => t.id !== transferId);
    setTransfers(prev => ({ ...prev, [scenarioId]: updated }));
    await syncAdjustments(scenarioId, actions[scenarioId] ?? [], updated);
  }

  async function persistAndSync(scenarioId: string, form: { action_type: ScenarioActionType; label: string; counterparty: string; amount: number; notes: string }) {
    const { data } = await supabase.from('scenario_actions').insert({
      scenario_id: scenarioId,
      scheme_id: scheme.id,
      ...form,
    }).select().single();
    if (!data) return;
    const updated = [...(actions[scenarioId] ?? []), data];
    setActions(prev => ({ ...prev, [scenarioId]: updated }));
    await syncAdjustments(scenarioId, updated);
    return updated;
  }

  async function addAction(scenarioId: string, form: ActionFormState) {
    const amt = parseFloat(form.amount.replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) return;
    await persistAndSync(scenarioId, { action_type: form.action_type, label: form.label, counterparty: form.counterparty, amount: amt, notes: form.notes });
    setShowFormFor(null);
  }

  async function applyFix(scenarioId: string, fix: SuggestedFix) {
    await persistAndSync(scenarioId, {
      action_type: fix.action_type,
      label: fix.actionLabel,
      counterparty: fix.counterparty,
      amount: fix.amount,
      notes: fix.notes,
    });
  }

  async function removeAction(scenarioId: string, actionId: string) {
    await supabase.from('scenario_actions').delete().eq('id', actionId);
    const updated = (actions[scenarioId] ?? []).filter(a => a.id !== actionId);
    setActions(prev => ({ ...prev, [scenarioId]: updated }));
    await syncAdjustments(scenarioId, updated);
  }

  function startEdit(action: ScenarioAction) {
    setEditingActionId(action.id);
    setEditDraft({ label: action.label, counterparty: action.counterparty, amount: String(action.amount), notes: action.notes });
  }

  async function commitEdit(scenarioId: string, actionId: string) {
    const amt = parseFloat(editDraft.amount.replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) { setEditingActionId(null); return; }
    await supabase.from('scenario_actions').update({
      label: editDraft.label,
      counterparty: editDraft.counterparty,
      amount: amt,
      notes: editDraft.notes,
    }).eq('id', actionId);
    const updated = (actions[scenarioId] ?? []).map(a =>
      a.id === actionId ? { ...a, label: editDraft.label, counterparty: editDraft.counterparty, amount: amt, notes: editDraft.notes } : a
    );
    setActions(prev => ({ ...prev, [scenarioId]: updated }));
    await syncAdjustments(scenarioId, updated);
    setEditingActionId(null);
  }

  // Toggle a single scenario's active state independently
  async function toggleScenario(scenario: ScenarioRecord) {
    setTogglingId(scenario.id);
    const next = !scenario.is_active;
    await supabase.from('scenarios').update({ is_active: next }).eq('id', scenario.id);
    setScenarios(s => s.map(sc => sc.id === scenario.id ? { ...sc, is_active: next } : sc));
    setTogglingId(null);
  }

  async function removeScenario(id: string) {
    if (!confirm('Delete this scenario?')) return;
    await supabase.from('scenarios').delete().eq('id', id);
    setScenarios(s => s.filter(sc => sc.id !== id));
  }

  // Stacked adjustments — sum all active scenarios
  const stackedAdj = activeScenarios.length > 0
    ? activeScenarios.reduce(
        (acc, sc) => {
          const d = deriveAdjustments(actions[sc.id] ?? [], nav, transfers[sc.id] ?? []);
          return {
            navDelta: acc.navDelta + d.navDelta,
            navAdjPct: acc.navAdjPct + d.navAdjPct,
            loanbackDelta: acc.loanbackDelta + d.loanbackDelta,
            borrowingDelta: acc.borrowingDelta + d.borrowingDelta,
            employerDelta: acc.employerDelta + d.employerDelta,
            cashDelta: acc.cashDelta + d.cashDelta,
          };
        },
        { navDelta: 0, navAdjPct: 0, loanbackDelta: 0, borrowingDelta: 0, employerDelta: 0, cashDelta: 0 }
      )
    : null;

  const stackedNav = stackedAdj ? nav + stackedAdj.navDelta : nav;
  const stackedCash = stackedAdj ? cash + stackedAdj.cashDelta : cash;
  const stackedLoanbacks = stackedAdj ? totals.loanbacks + stackedAdj.loanbackDelta : totals.loanbacks;
  const stackedBorrowing = stackedAdj ? totals.borrowing + stackedAdj.borrowingDelta : totals.borrowing;
  const stackedEmployer = stackedAdj ? totals.employer + stackedAdj.employerDelta : totals.employer;

  const sMaxLoanback = 0.5 * stackedNav;
  const sMaxBorrowing = 0.5 * stackedNav;
  const sMaxEmployer = 0.20 * stackedNav;

  const barSeries = [
    { name: 'Stacked HMRC Limit', color: '#e5e7eb', values: [sMaxLoanback, sMaxBorrowing, sMaxEmployer] },
    { name: 'Stacked Used', color: '#ef4444', values: [stackedLoanbacks, stackedBorrowing, stackedEmployer] },
  ];

  const stackedTitle = activeScenarios.length === 1
    ? activeScenarios[0].scenario_name
    : `${activeScenarios.length} Scenarios Stacked`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scenarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">Activate one or more scenarios to stack their impact on HMRC limits</p>
        </div>
        <button onClick={addScenario} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
          <Plus size={16} /> New Scenario
        </button>
      </div>

      {scenarios.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
          No scenarios created. Click "New Scenario" to begin modelling.
        </div>
      ) : (
        <div className="space-y-4">
          {scenarios.map(sc => {
            const scActions = actions[sc.id] ?? [];
            const adj = deriveAdjustments(scActions, nav, transfers[sc.id] ?? []);
            const scNav = nav + adj.navDelta;
            const scCash = cash + adj.cashDelta;
            const scLoanbacks = totals.loanbacks + adj.loanbackDelta;
            const scBorrowing = totals.borrowing + adj.borrowingDelta;
            const scEmployer = totals.employer + adj.employerDelta;

            const issues = scActions.length > 0 ? diagnoseIssues({
              cash: scCash, nav: scNav,
              loanbacks: scLoanbacks, borrowing: scBorrowing, employer: scEmployer,
              baseCash: cash, baseNav: nav,
              baseLoanbacks: totals.loanbacks, baseBorrowing: totals.borrowing, baseEmployer: totals.employer,
            }) : [];

            const isToggling = togglingId === sc.id;

            return (
              <div key={sc.id} className={`bg-white rounded-xl border shadow-sm transition-all ${sc.is_active ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-100'}`}>
                {/* Header */}
                <div className="flex items-start gap-4 p-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="min-w-[180px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Scenario Name</label>
                        <LocalTextInput
                          value={sc.scenario_name}
                          onCommit={v => updateScenarioName(sc.id, v)}
                          placeholder="Scenario name"
                          className="w-full text-sm font-semibold border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                      {issues.some(i => i.severity === 'error') && (
                        <div className="mt-5 flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg">
                          <AlertTriangle size={12} className="text-amber-600" />
                          <span className="text-xs font-semibold text-amber-700">{issues.filter(i => i.severity === 'error').length} issue{issues.filter(i => i.severity === 'error').length > 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setShowDescFor(p => ({ ...p, [sc.id]: !p[sc.id] }))}
                      className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      {showDescFor[sc.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {sc.description ? 'Edit description' : 'Add description'}
                    </button>
                    {showDescFor[sc.id] && (
                      <textarea
                        defaultValue={sc.description ?? ''}
                        onBlur={e => updateScenarioDesc(sc.id, e.target.value)}
                        rows={2}
                        placeholder="Describe the purpose or assumptions of this scenario…"
                        className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 resize-y"
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-2 shrink-0 mt-4">
                    {/* Toggle active button */}
                    <button
                      onClick={() => toggleScenario(sc)}
                      disabled={isToggling}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        sc.is_active
                          ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {sc.is_active ? <><Check size={11} /> Active</> : 'Activate'}
                    </button>
                    <button onClick={() => removeScenario(sc.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Actions list */}
                <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Planned Actions</p>
                    {showFormFor !== sc.id && (
                      <button
                        onClick={() => setShowFormFor(sc.id)}
                        className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
                      >
                        <Plus size={13} /> Add action
                      </button>
                    )}
                  </div>

                  {scActions.length === 0 && showFormFor !== sc.id && (
                    <p className="text-xs text-gray-400 italic">No actions yet. Add a transaction to model its impact.</p>
                  )}

                  {scActions.map(a => {
                    const meta = ACTION_META[a.action_type];
                    const isEditing = editingActionId === a.id;

                    if (isEditing) {
                      return (
                        <div key={a.id} className={`rounded-lg border p-3 space-y-2 ${meta.color}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="shrink-0">{meta.icon}</span>
                            <span className="text-xs font-semibold">{meta.label}</span>
                            <span className="ml-auto text-xs opacity-60">Editing</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium opacity-70 mb-0.5">Description</label>
                              <input
                                type="text"
                                value={editDraft.label}
                                onChange={e => setEditDraft(d => ({ ...d, label: e.target.value }))}
                                className="w-full text-xs border border-current/20 rounded-md px-2 py-1.5 bg-white/80 focus:outline-none focus:ring-1 focus:ring-current"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium opacity-70 mb-0.5">Counterparty</label>
                              <input
                                type="text"
                                value={editDraft.counterparty}
                                onChange={e => setEditDraft(d => ({ ...d, counterparty: e.target.value }))}
                                className="w-full text-xs border border-current/20 rounded-md px-2 py-1.5 bg-white/80 focus:outline-none focus:ring-1 focus:ring-current"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium opacity-70 mb-0.5">Amount (£)</label>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-60 pointer-events-none">£</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={editDraft.amount}
                                  onChange={e => setEditDraft(d => ({ ...d, amount: e.target.value }))}
                                  className="w-full pl-5 text-xs border border-current/20 rounded-md px-2 py-1.5 bg-white/80 focus:outline-none focus:ring-1 focus:ring-current"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium opacity-70 mb-0.5">Notes</label>
                              <input
                                type="text"
                                value={editDraft.notes}
                                onChange={e => setEditDraft(d => ({ ...d, notes: e.target.value }))}
                                className="w-full text-xs border border-current/20 rounded-md px-2 py-1.5 bg-white/80 focus:outline-none focus:ring-1 focus:ring-current"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => commitEdit(sc.id, a.id)}
                              className="flex items-center gap-1 px-3 py-1 bg-white/90 border border-current/30 rounded-md text-xs font-semibold hover:bg-white transition-colors"
                            >
                              <Check size={11} /> Save
                            </button>
                            <button
                              onClick={() => setEditingActionId(null)}
                              className="px-3 py-1 bg-white/50 border border-current/20 rounded-md text-xs hover:bg-white/80 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const adjs = actionToAdjustments(a);
                    return (
                      <div key={a.id} className={`flex items-start gap-3 p-3 rounded-lg border ${meta.color}`}>
                        <div className="mt-0.5 shrink-0">{meta.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xs font-semibold">{meta.label}</span>
                            {a.counterparty && <span className="text-xs opacity-70">— {a.counterparty}</span>}
                          </div>
                          <p className="text-xs mt-0.5">{a.label}</p>
                          {a.notes && <p className="text-xs opacity-60 mt-0.5">{a.notes}</p>}
                          <div className="flex flex-wrap gap-3 mt-1.5 text-xs font-medium">
                            <span>Amount: {fmtFull(Number(a.amount))}</span>
                            {adjs.cashDelta !== 0 && (
                              <span className={adjs.cashDelta > 0 ? 'text-emerald-700' : 'text-red-700'}>
                                Cash: {adjs.cashDelta > 0 ? '+' : ''}{fmtFull(adjs.cashDelta)}
                              </span>
                            )}
                            {adjs.loanbackDelta !== 0 && <span>Loanbacks: {adjs.loanbackDelta > 0 ? '+' : ''}{fmtFull(adjs.loanbackDelta)}</span>}
                            {adjs.borrowingDelta !== 0 && <span>Borrowing: {adjs.borrowingDelta > 0 ? '+' : ''}{fmtFull(adjs.borrowingDelta)}</span>}
                            {adjs.employerDelta !== 0 && <span>Employer Inv.: {adjs.employerDelta > 0 ? '+' : ''}{fmtFull(adjs.employerDelta)}</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          <button onClick={() => startEdit(a)} className="p-1 rounded hover:bg-black/10 transition-colors" title="Edit">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => removeAction(sc.id, a.id)} className="p-1 rounded hover:bg-black/10 transition-colors" title="Delete">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {showFormFor === sc.id && (
                    <ActionForm
                      onSave={form => addAction(sc.id, form)}
                      onCancel={() => setShowFormFor(null)}
                    />
                  )}

                  {/* Pending Transfers section */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <CalendarClock size={13} className="text-gray-400" />
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending Transfers & Pension Payments</h4>
                      </div>
                      <button
                        onClick={() => {
                          setShowTransferFormFor(prev => prev === sc.id ? null : sc.id);
                          setTransferDraft({ description: '', source: '', amount: '', expected_date: '' });
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                      >
                        <Plus size={11} /> Add Transfer
                      </button>
                    </div>

                    {(transfers[sc.id] ?? []).length > 0 && (
                      <div className="space-y-1.5">
                        {(transfers[sc.id] ?? []).map(t => (
                          <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-emerald-100 bg-emerald-50/50">
                            <ArrowDownCircle size={14} className="text-emerald-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-gray-800">{t.description || 'Transfer'}</span>
                                {t.source && <span className="text-xs text-gray-500">— {t.source}</span>}
                              </div>
                              <div className="flex flex-wrap gap-3 mt-0.5 text-xs">
                                <span className="font-medium text-emerald-700">+{fmtFull(Number(t.amount))}</span>
                                {t.expected_date && <span className="text-gray-400">{new Date(t.expected_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => removeTransfer(sc.id, t.id)}
                              className="p-1 rounded hover:bg-black/10 transition-colors shrink-0"
                              title="Remove"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {showTransferFormFor === sc.id && (
                      <div className="mt-2 p-3 rounded-lg border border-gray-200 bg-gray-50/50 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Description</label>
                            <input
                              type="text"
                              value={transferDraft.description}
                              onChange={e => setTransferDraft(d => ({ ...d, description: e.target.value }))}
                              placeholder="e.g. Employer pension contribution"
                              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Source</label>
                            <input
                              type="text"
                              value={transferDraft.source}
                              onChange={e => setTransferDraft(d => ({ ...d, source: e.target.value }))}
                              placeholder="e.g. Metro Bank, HMRC"
                              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Amount (£)</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">£</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={transferDraft.amount}
                                onChange={e => setTransferDraft(d => ({ ...d, amount: e.target.value }))}
                                placeholder="0"
                                className="w-full pl-5 text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Expected Date</label>
                            <input
                              type="date"
                              value={transferDraft.expected_date}
                              onChange={e => setTransferDraft(d => ({ ...d, expected_date: e.target.value }))}
                              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => addTransfer(sc.id)}
                            className="flex items-center gap-1 px-3 py-1 bg-gray-900 text-white rounded-md text-xs font-semibold hover:bg-gray-800 transition-colors"
                          >
                            <Check size={11} /> Add
                          </button>
                          <button
                            onClick={() => setShowTransferFormFor(null)}
                            className="px-3 py-1 border border-gray-200 rounded-md text-xs hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {(transfers[sc.id] ?? []).length === 0 && showTransferFormFor !== sc.id && (
                      <p className="text-xs text-gray-400 italic">No pending transfers. Add future transfers and pension payments here.</p>
                    )}
                  </div>

                  {/* Per-scenario impact summary */}
                  {(scActions.length > 0 || (transfers[sc.id] ?? []).length > 0) && (
                    <div className="mt-1 pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-6 gap-3">
                      {[
                        { label: 'Scenario Cash', value: scCash, delta: adj.cashDelta },
                        { label: 'Scenario NAV', value: scNav, delta: adj.navDelta },
                        { label: 'Pending Transfers', value: null, delta: (transfers[sc.id] ?? []).reduce((s, t) => s + Number(t.amount), 0) },
                        { label: 'Loanback Impact', value: null, delta: adj.loanbackDelta },
                        { label: 'Borrowing Impact', value: null, delta: adj.borrowingDelta },
                        { label: 'Employer Inv. Impact', value: null, delta: adj.employerDelta },
                      ].map(({ label, value, delta }) => (
                        <div key={label} className="text-xs">
                          <p className="text-gray-400 font-medium">{label}</p>
                          {value !== null && (
                            <p className={`font-semibold mt-0.5 ${value < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmtFull(value)}</p>
                          )}
                          <p className={`font-medium mt-0.5 ${delta === 0 ? 'text-gray-400' : delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {delta === 0 ? '—' : (delta > 0 ? '+' : '') + fmtFull(delta)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Issue banners with fix suggestions */}
                  {issues.length > 0 && (
                    <div className="mt-1">
                      <IssueBanner issues={issues} onApplyFix={fix => applyFix(sc.id, fix)} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stacked scenario outputs — shown when one or more scenarios are active */}
      {activeScenarios.length > 0 && (
        <>
          {/* Active scenario pills */}
          {activeScenarios.length > 1 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stacking:</span>
              {activeScenarios.map(sc => (
                <span key={sc.id} className="flex items-center gap-1 px-2.5 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-medium text-red-700">
                  <Check size={10} /> {sc.scenario_name}
                </span>
              ))}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              {activeScenarios.length > 1 ? 'Stacked Scenario Position' : `Scenario Position — ${stackedTitle}`}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Stacked NAV', value: stackedNav, base: nav },
                { label: 'Stacked Cash', value: stackedCash, base: cash },
                { label: 'Stacked Loanbacks', value: stackedLoanbacks, base: totals.loanbacks },
                { label: 'Stacked Borrowing', value: stackedBorrowing, base: totals.borrowing },
              ].map(({ label, value, base }) => {
                const delta = value - base;
                return (
                  <div key={label} className="space-y-0.5">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className={`text-base font-semibold ${value < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmtFull(value)}</p>
                    {delta !== 0 && (
                      <p className={`text-xs font-medium ${delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {delta > 0 ? '+' : ''}{fmtFull(delta)} vs base
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cash waterfall chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">
              Cash Position Impact
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              How each active scenario draws down cash from the base position
            </p>
            <CashWaterfallChart
              steps={(() => {
                const waterfallSteps: WaterfallStep[] = [
                  { label: 'Base Cash', delta: 0, runningTotal: cash, type: 'base' },
                ];
                let running = cash;
                for (const sc of activeScenarios) {
                  const d = deriveAdjustments(actions[sc.id] ?? [], nav, transfers[sc.id] ?? []);
                  running += d.cashDelta;
                  waterfallSteps.push({
                    label: sc.scenario_name,
                    delta: d.cashDelta,
                    runningTotal: running,
                    type: 'change',
                  });
                }
                waterfallSteps.push({
                  label: activeScenarios.length > 1 ? 'Combined' : 'Result',
                  delta: 0,
                  runningTotal: stackedCash,
                  type: 'total',
                });
                return waterfallSteps;
              })()}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Loanback Capacity', value: stackedLoanbacks, max: sMaxLoanback, sublabel: 'vs 50% Stacked NAV limit' },
              { label: 'Borrowing Capacity', value: stackedBorrowing, max: sMaxBorrowing, sublabel: 'vs 50% Stacked NAV limit' },
              { label: 'Employer Inv. Capacity', value: stackedEmployer, max: sMaxEmployer, sublabel: 'vs 20% Stacked NAV limit' },
            ].map(g => (
              <div key={g.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col items-center">
                <GaugeChart value={g.value} max={g.max} label={g.sublabel} color={gaugeColor(g.value, g.max)} />
                <p className="text-xs font-semibold text-gray-700 mt-2 text-center">{g.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              HMRC Capacity vs Usage — {stackedTitle}
            </h2>
            <BarChart categories={['Loanback', 'Borrowing', 'Employer Inv.']} series={barSeries} />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                {activeScenarios.length > 1 ? 'Stacked Capacity Summary' : 'Scenario Capacity Summary'}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Category', 'Current (Base)', 'Stacked Value', 'Stacked Limit', 'Remaining', 'Status'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    { cat: 'Loanback', base: totals.loanbacks, scenario: stackedLoanbacks, limit: sMaxLoanback },
                    { cat: 'Borrowing', base: totals.borrowing, scenario: stackedBorrowing, limit: sMaxBorrowing },
                    { cat: 'Employer Investments', base: totals.employer, scenario: stackedEmployer, limit: sMaxEmployer },
                  ].map(r => {
                    const rem = r.limit - r.scenario;
                    const status = rem < 0 ? 'Breach' : rem < 0.1 * r.limit ? 'Warning' : 'OK';
                    const statusCls = { Breach: 'text-red-600', Warning: 'text-amber-600', OK: 'text-emerald-600' }[status];
                    return (
                      <tr key={r.cat} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-800">{r.cat}</td>
                        <td className="px-6 py-3 text-gray-600">{fmt(r.base)}</td>
                        <td className="px-6 py-3 font-semibold text-gray-800">{fmt(r.scenario)}</td>
                        <td className="px-6 py-3 text-gray-600">{fmt(r.limit)}</td>
                        <td className={`px-6 py-3 font-semibold ${rem < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(rem)}</td>
                        <td className="px-6 py-3"><span className={`text-xs font-semibold ${statusCls}`}>{status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeScenarios.length === 0 && scenarios.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-5 text-sm text-amber-700 text-center">
          Activate one or more scenarios above to view stacked gauge outputs and capacity analysis.
        </div>
      )}
    </div>
  );
}
