import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, PropertyRecord } from '../types';
import Modal from '../components/Modal';

const empty = (): Omit<PropertyRecord, 'id' | 'scheme_id' | 'created_at'> => ({
  property_name: '', address: '', purchase_date: null, purchase_price: 0,
  current_value: 0, annual_rent: 0, tenant: '', lease_expiry: null, notes: '',
});

function fmt(v: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(v);
}

interface Props { scheme: SsasScheme; }

export default function PropertyRegister({ scheme }: Props) {
  const [records, setRecords] = useState<PropertyRecord[]>([]);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; record: Omit<PropertyRecord, 'id' | 'scheme_id' | 'created_at'>; id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [scheme.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('property_register').select('*').eq('scheme_id', scheme.id).order('created_at');
    setRecords(data ?? []);
    setLoading(false);
  }

  async function save() {
    if (!modal) return;
    setSaving(true);
    if (modal.mode === 'add') {
      await supabase.from('property_register').insert({ ...modal.record, scheme_id: scheme.id });
    } else {
      await supabase.from('property_register').update(modal.record).eq('id', modal.id!);
    }
    setSaving(false);
    setModal(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this property record?')) return;
    await supabase.from('property_register').delete().eq('id', id);
    load();
  }

  const set = (f: string, v: unknown) => setModal(m => m ? { ...m, record: { ...m.record, [f]: v } } : m);

  const total = records.reduce((s, r) => s + Number(r.current_value), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Property Register</h1>
          <p className="text-sm text-gray-500 mt-0.5">Commercial property holdings — Total value: <strong>{fmt(total)}</strong></p>
        </div>
        <button onClick={() => setModal({ mode: 'add', record: empty() })} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
          <Plus size={16} /> Add Property
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">No properties recorded. Click "Add Property" to begin.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Property Name', 'Address', 'Tenant', 'Purchase Date', 'Purchase Price', 'Current Value', 'Annual Rent', 'Lease Expiry', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800">{r.property_name}</td>
                    <td className="px-5 py-3 text-gray-600 max-w-[160px] truncate">{r.address || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{r.tenant || '—'}</td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{r.purchase_date ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{fmt(Number(r.purchase_price))}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{fmt(Number(r.current_value))}</td>
                    <td className="px-5 py-3 text-gray-700">{fmt(Number(r.annual_rent))}</td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{r.lease_expiry ?? '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setModal({ mode: 'edit', record: { property_name: r.property_name, address: r.address, purchase_date: r.purchase_date, purchase_price: Number(r.purchase_price), current_value: Number(r.current_value), annual_rent: Number(r.annual_rent), tenant: r.tenant, lease_expiry: r.lease_expiry, notes: r.notes }, id: r.id })} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Pencil size={14} /></button>
                        <button onClick={() => remove(r.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-5 py-3 text-sm font-semibold text-gray-700">Totals</td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-900">{fmt(total)}</td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-900">{fmt(records.reduce((s, r) => s + Number(r.annual_rent), 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add Property' : 'Edit Property'} onClose={() => setModal(null)} size="lg">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Property Name', field: 'property_name', type: 'text', span: 2 },
              { label: 'Address', field: 'address', type: 'text', span: 2 },
              { label: 'Tenant', field: 'tenant', type: 'text' },
              { label: 'Purchase Date', field: 'purchase_date', type: 'date' },
              { label: 'Purchase Price (£)', field: 'purchase_price', type: 'number' },
              { label: 'Current Value (£)', field: 'current_value', type: 'number' },
              { label: 'Annual Rent (£)', field: 'annual_rent', type: 'number' },
              { label: 'Lease Expiry', field: 'lease_expiry', type: 'date' },
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
            <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
