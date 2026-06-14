import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, FundInvestmentRecord } from '../types';
import Modal from '../components/Modal';

function fmt(v: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(v);
}

const FUND_TYPES = ['Unit Trust', 'OEIC', 'Investment Bond', 'Investment Trust', 'ETF', 'Other'];

const empty = (): Omit<FundInvestmentRecord, 'id' | 'scheme_id' | 'created_at'> => ({
  fund_name: '',
  fund_manager: 'St James\'s Place',
  fund_type: 'Investment Bond',
  current_value: 0,
  investment_date: null,
  notes: '',
});

interface Props { scheme: SsasScheme; }

export default function FundInvestments({ scheme }: Props) {
  const [records, setRecords] = useState<FundInvestmentRecord[]>([]);
  const [modal, setModal] = useState<{
    mode: 'add' | 'edit';
    record: Omit<FundInvestmentRecord, 'id' | 'scheme_id' | 'created_at'>;
    id?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [scheme.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('fund_investments')
      .select('*')
      .eq('scheme_id', scheme.id)
      .order('fund_manager');
    setRecords(data ?? []);
    setLoading(false);
  }

  async function save() {
    if (!modal) return;
    setSaving(true);
    if (modal.mode === 'add') {
      await supabase.from('fund_investments').insert({ ...modal.record, scheme_id: scheme.id });
    } else {
      await supabase.from('fund_investments').update({
        ...modal.record,
        updated_at: new Date().toISOString(),
      }).eq('id', modal.id!);
    }
    setSaving(false);
    setModal(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this fund investment?')) return;
    await supabase.from('fund_investments').delete().eq('id', id);
    load();
  }

  const set = (f: string, v: unknown) =>
    setModal(m => m ? { ...m, record: { ...m.record, [f]: v } } : m);

  const total = records.reduce((s, r) => s + Number(r.current_value), 0);

  // Group by manager
  const byManager: Record<string, number> = {};
  records.forEach(r => {
    byManager[r.fund_manager || 'Unknown'] = (byManager[r.fund_manager || 'Unknown'] ?? 0) + Number(r.current_value);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fund Investments</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Collective investment funds (unit trusts, OEICs, investment bonds) — not employer-related
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: 'add', record: empty() })}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
        >
          <Plus size={16} /> Add Fund
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Total Fund Value</p>
          <p className="text-2xl font-bold text-gray-800">{fmt(total)}</p>
          <p className="text-xs text-gray-500 mt-1">{records.length} fund{records.length !== 1 ? 's' : ''} held</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">HMRC Status</p>
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">No specific limit</span>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            Collective investment funds are permissible SSAS investments not subject to the employer-related 20% cap
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">By Manager</p>
          <div className="space-y-1.5">
            {Object.entries(byManager).map(([name, amount]) => (
              <div key={name} className="flex justify-between text-sm">
                <span className="text-gray-600 truncate mr-2">{name}</span>
                <span className="font-semibold text-gray-800 shrink-0">{fmt(amount)}</span>
              </div>
            ))}
            {Object.keys(byManager).length === 0 && (
              <p className="text-xs text-gray-400">No funds recorded</p>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">No fund investments recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Fund Name', 'Fund Manager', 'Type', 'Current Value', 'Investment Date', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800">{r.fund_name || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{r.fund_manager || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{r.fund_type || '—'}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{fmt(Number(r.current_value))}</td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{r.investment_date ?? '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setModal({
                            mode: 'edit',
                            record: {
                              fund_name: r.fund_name,
                              fund_manager: r.fund_manager,
                              fund_type: r.fund_type,
                              current_value: Number(r.current_value),
                              investment_date: r.investment_date,
                              notes: r.notes,
                            },
                            id: r.id,
                          })}
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => remove(r.id)}
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={3} className="px-5 py-3 text-sm font-semibold text-gray-700">Total</td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-900">{fmt(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add Fund Investment' : 'Edit Fund Investment'}
          onClose={() => setModal(null)}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Fund Name</label>
              <input
                type="text"
                value={modal.record.fund_name}
                onChange={e => set('fund_name', e.target.value)}
                placeholder="e.g. St James's Place Balanced Managed Fund"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fund Manager</label>
              <input
                type="text"
                value={modal.record.fund_manager}
                onChange={e => set('fund_manager', e.target.value)}
                placeholder="e.g. St James's Place"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fund Type</label>
              <select
                value={modal.record.fund_type}
                onChange={e => set('fund_type', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
              >
                <option value="">Select type…</option>
                {FUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Current Value (£)</label>
              <input
                type="number"
                value={modal.record.current_value === 0 ? '' : modal.record.current_value}
                onChange={e => set('current_value', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Investment Date</label>
              <input
                type="date"
                value={modal.record.investment_date ?? ''}
                onChange={e => set('investment_date', e.target.value || null)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={modal.record.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
            <button
              onClick={() => setModal(null)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
