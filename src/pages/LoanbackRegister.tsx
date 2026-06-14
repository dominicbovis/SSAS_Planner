import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, LoanbackRecord } from '../types';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';

const EMPLOYER_NAME = 'Red Horizon Holdings Limited';

const empty = (): Omit<LoanbackRecord, 'id' | 'scheme_id' | 'created_at'> => ({
  employer_name: EMPLOYER_NAME, loan_amount: 0, interest_rate: 0, loan_date: null,
  repayment_date: null, outstanding_balance: 0, security: '', notes: '',
});

function fmt(v: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(v);
}

interface Props { scheme: SsasScheme; }

export default function LoanbackRegister({ scheme }: Props) {
  const [records, setRecords] = useState<LoanbackRecord[]>([]);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; record: Omit<LoanbackRecord, 'id' | 'scheme_id' | 'created_at'>; id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [scheme.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('loanback_register').select('*').eq('scheme_id', scheme.id).order('created_at');
    setRecords(data ?? []);
    setLoading(false);
  }

  async function save() {
    if (!modal) return;
    setSaving(true);
    if (modal.mode === 'add') await supabase.from('loanback_register').insert({ ...modal.record, scheme_id: scheme.id });
    else await supabase.from('loanback_register').update(modal.record).eq('id', modal.id!);
    setSaving(false);
    setModal(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this loanback record?')) return;
    await supabase.from('loanback_register').delete().eq('id', id);
    load();
  }

  const set = (f: string, v: unknown) => setModal(m => m ? { ...m, record: { ...m.record, [f]: v } } : m);

  const nav = Number(scheme.net_asset_value);
  const limit = 0.5 * nav;
  const total = records.reduce((s, r) => s + Number(r.outstanding_balance), 0);
  const remaining = limit - total;
  const isBreached = total > limit;
  const isWarning = !isBreached && total > 0.45 * nav;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Loanback Register</h1>
          <p className="text-sm text-gray-500 mt-0.5">Loans back to sponsoring employer — HMRC limit: 50% of NAV ({fmt(limit)})</p>
        </div>
        <button onClick={() => setModal({ mode: 'add', record: empty() })} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
          <Plus size={16} /> Add Loanback
        </button>
      </div>

      {/* Capacity bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-700">Loanback Capacity</p>
            <p className="text-xs text-gray-500 mt-0.5">{fmt(total)} used of {fmt(limit)} HMRC limit</p>
          </div>
          <StatusBadge status={isBreached ? 'Breach' : isWarning ? 'Warning' : 'OK'} />
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isBreached ? 'bg-red-500' : isWarning ? 'bg-amber-400' : 'bg-emerald-500'}`}
            style={{ width: `${Math.min((total / limit) * 100, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>£0</span>
          <span className={remaining < 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}>
            {remaining < 0 ? `Over limit by ${fmt(Math.abs(remaining))}` : `${fmt(remaining)} remaining`}
          </span>
          <span>{fmt(limit)}</span>
        </div>
        {isBreached && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>HMRC 50% loanback limit exceeded. Immediate action required.</span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">No loanback records. Click "Add Loanback" to begin.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Employer', 'Loan Amount', 'Interest Rate', 'Loan Date', 'Repayment Date', 'Outstanding Balance', 'Security', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800">{r.employer_name}</td>
                    <td className="px-5 py-3 text-gray-700">{fmt(Number(r.loan_amount))}</td>
                    <td className="px-5 py-3 text-gray-600">{r.interest_rate}%</td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{r.loan_date ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{r.repayment_date ?? '—'}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{fmt(Number(r.outstanding_balance))}</td>
                    <td className="px-5 py-3 text-gray-600 max-w-[120px] truncate">{r.security || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setModal({ mode: 'edit', record: { employer_name: r.employer_name, loan_amount: Number(r.loan_amount), interest_rate: Number(r.interest_rate), loan_date: r.loan_date, repayment_date: r.repayment_date, outstanding_balance: Number(r.outstanding_balance), security: r.security, notes: r.notes }, id: r.id })} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"><Pencil size={14} /></button>
                        <button onClick={() => remove(r.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-5 py-3 text-sm font-semibold text-gray-700">Total Outstanding</td>
                  <td className={`px-5 py-3 text-sm font-bold ${isBreached ? 'text-red-700' : 'text-gray-900'}`}>{fmt(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add Loanback' : 'Edit Loanback'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Employer Name</label>
              <div className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 font-medium">{EMPLOYER_NAME}</div>
            </div>
            {[
              { label: 'Loan Amount (£)', field: 'loan_amount', type: 'number' },
              { label: 'Interest Rate (%)', field: 'interest_rate', type: 'number' },
              { label: 'Loan Date', field: 'loan_date', type: 'date' },
              { label: 'Repayment Date', field: 'repayment_date', type: 'date' },
              { label: 'Outstanding Balance (£)', field: 'outstanding_balance', type: 'number' },
              { label: 'Security', field: 'security', type: 'text' },
            ].map(({ label, field, type, span }) => (
              <div key={field} className={span === 2 ? 'col-span-2' : ''}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input
                  type={type}
                  value={type === 'number' ? ((modal.record as Record<string, unknown>)[field] === 0 ? '' : (modal.record as Record<string, unknown>)[field] as string ?? '') : ((modal.record as Record<string, unknown>)[field] as string ?? '')}
                  onChange={e => set(field, type === 'number' ? (e.target.value === '' ? 0 : parseFloat(e.target.value) || 0) : e.target.value || null)}
                  placeholder={type === 'number' ? '0' : ''}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
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
