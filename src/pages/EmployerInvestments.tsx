import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, EmployerInvestmentRecord } from '../types';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';

const EMPLOYER_NAME = 'Red Horizon Holdings Limited';

const empty = (): Omit<EmployerInvestmentRecord, 'id' | 'scheme_id' | 'created_at'> => ({
  employer_name: EMPLOYER_NAME, investment_type: '', amount: 0, investment_date: null, notes: '',
});

function fmt(v: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(v);
}

interface Props { scheme: SsasScheme; }

export default function EmployerInvestments({ scheme }: Props) {
  const [records, setRecords] = useState<EmployerInvestmentRecord[]>([]);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; record: Omit<EmployerInvestmentRecord, 'id' | 'scheme_id' | 'created_at'>; id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [scheme.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('employer_related_investments').select('*').eq('scheme_id', scheme.id).order('employer_name');
    setRecords(data ?? []);
    setLoading(false);
  }

  async function save() {
    if (!modal) return;
    setSaving(true);
    if (modal.mode === 'add') await supabase.from('employer_related_investments').insert({ ...modal.record, scheme_id: scheme.id });
    else await supabase.from('employer_related_investments').update(modal.record).eq('id', modal.id!);
    setSaving(false);
    setModal(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this investment record?')) return;
    await supabase.from('employer_related_investments').delete().eq('id', id);
    load();
  }

  const set = (f: string, v: unknown) => setModal(m => m ? { ...m, record: { ...m.record, [f]: v } } : m);

  const nav = Number(scheme.net_asset_value);
  const perLimit = 0.05 * nav;
  const aggLimit = 0.20 * nav;
  const total = records.reduce((s, r) => s + Number(r.amount), 0);
  const remaining = aggLimit - total;
  const isAggBreached = total > aggLimit;
  const isWarning = !isAggBreached && total > 0.18 * nav;

  // Group by employer for per-employer check
  const byEmployer: Record<string, number> = {};
  records.forEach(r => { byEmployer[r.employer_name] = (byEmployer[r.employer_name] ?? 0) + Number(r.amount); });
  const breachedEmployers = Object.entries(byEmployer).filter(([, v]) => v > perLimit);

  const overallStatus = breachedEmployers.length > 0
    ? 'Per-employer breach'
    : isAggBreached
    ? 'Breach'
    : isWarning
    ? 'Warning'
    : 'OK';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employer-Related Investments</h1>
          <p className="text-sm text-gray-500 mt-0.5">HMRC limits: 5% per employer, 20% aggregate of NAV</p>
        </div>
        <button onClick={() => setModal({ mode: 'add', record: empty() })} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
          <Plus size={16} /> Add Investment
        </button>
      </div>

      {/* Capacity cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Aggregate Capacity</p>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Used</span>
            <span className={`text-sm font-bold ${isAggBreached ? 'text-red-600' : 'text-gray-800'}`}>{fmt(total)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div className={`h-full rounded-full ${isAggBreached ? 'bg-red-500' : isWarning ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min((total / aggLimit) * 100, 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mb-3">
            <span>£0</span><span>{fmt(aggLimit)} (20%)</span>
          </div>
          <StatusBadge status={overallStatus} />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Per-Employer Limit</p>
          <p className="text-2xl font-bold text-gray-800 mb-1">{fmt(perLimit)}</p>
          <p className="text-xs text-gray-500">5% of NAV per employer</p>
          {breachedEmployers.length > 0 && (
            <div className="mt-3 flex items-start gap-2 p-2 bg-red-50 rounded-lg text-xs text-red-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{breachedEmployers.map(([n]) => n).join(', ')} exceed limit</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Aggregate Remaining</p>
          <p className={`text-2xl font-bold mb-1 ${remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(remaining)}</p>
          <p className="text-xs text-gray-500">of {fmt(aggLimit)} aggregate limit</p>
        </div>
      </div>

      {/* Per-employer summary */}
      {Object.keys(byEmployer).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Per-Employer Breakdown</h3>
          <div className="space-y-3">
            {Object.entries(byEmployer).map(([name, amount]) => {
              const pct = (amount / perLimit) * 100;
              const breach = amount > perLimit;
              return (
                <div key={name}>
                  <div className="flex items-center justify-between mb-1 text-sm">
                    <span className="font-medium text-gray-700">{name}</span>
                    <div className="flex items-center gap-3">
                      <span className={breach ? 'text-red-600 font-semibold' : 'text-gray-600'}>{fmt(amount)}</span>
                      {breach && <StatusBadge status="Breach" />}
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${breach ? 'bg-red-500' : pct > 90 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">No employer-related investments recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Employer', 'Investment Type', 'Amount', 'Investment Date', 'Per-Employer Status', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map(r => {
                  const empTotal = byEmployer[r.employer_name] ?? 0;
                  const empBreach = empTotal > perLimit;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-800">{r.employer_name}</td>
                      <td className="px-5 py-3 text-gray-600">{r.investment_type || '—'}</td>
                      <td className="px-5 py-3 font-semibold text-gray-800">{fmt(Number(r.amount))}</td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{r.investment_date ?? '—'}</td>
                      <td className="px-5 py-3"><StatusBadge status={empBreach ? 'Breach' : 'OK'} /></td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setModal({ mode: 'edit', record: { employer_name: r.employer_name, investment_type: r.investment_type, amount: Number(r.amount), investment_date: r.investment_date, notes: r.notes }, id: r.id })} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"><Pencil size={14} /></button>
                          <button onClick={() => remove(r.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={2} className="px-5 py-3 text-sm font-semibold text-gray-700">Total</td>
                  <td className={`px-5 py-3 text-sm font-bold ${isAggBreached ? 'text-red-700' : 'text-gray-900'}`}>{fmt(total)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add Investment' : 'Edit Investment'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Employer Name</label>
              <div className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 font-medium">{EMPLOYER_NAME}</div>
            </div>
            {[
              { label: 'Investment Type', field: 'investment_type', type: 'text', span: 2 },
              { label: 'Amount (£)', field: 'amount', type: 'number' },
              { label: 'Investment Date', field: 'investment_date', type: 'date' },
            ].map(({ label, field, type, span }) => (
              <div key={field} className={span === 2 ? 'col-span-2' : ''}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input type={type} value={type === 'number' ? ((modal.record as Record<string, unknown>)[field] === 0 ? '' : (modal.record as Record<string, unknown>)[field] as string ?? '') : ((modal.record as Record<string, unknown>)[field] as string ?? '')} onChange={e => set(field, type === 'number' ? (e.target.value === '' ? 0 : parseFloat(e.target.value) || 0) : e.target.value || null)} placeholder={type === 'number' ? '0' : ''} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500" />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={modal.record.notes} onChange={e => set('notes', e.target.value)} rows={3} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
            <button onClick={() => setModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
