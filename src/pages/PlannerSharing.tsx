import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Eye, Loader2, Share2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { callEdgeFunction } from '../lib/functions';
import type { PlannerShare, SsasScheme } from '../types';
import { ErrorBox, Field, inputClass } from '../components/AuthFields';

interface Props {
  scheme: SsasScheme;
}

export default function PlannerSharing({ scheme }: Props) {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const [shares, setShares] = useState<PlannerShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('planner_shares')
      .select('*')
      .eq('scheme_id', scheme.id)
      .order('created_at');
    if (error) {
      setLoadError('We could not load who this planner is shared with. Please refresh the page.');
    } else {
      setShares((data ?? []) as PlannerShare[]);
    }
    setLoading(false);
  }, [scheme.id]);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  async function handleShare(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      await callEdgeFunction('share-planner', token, {
        schemeId: scheme.id,
        email: cleanEmail,
        redirectTo: window.location.origin,
      });
      setEmail('');
      setNotice(`${cleanEmail} can now view this planner.`);
      await loadShares();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not share this planner.');
    } finally {
      setBusy(false);
    }
  }

  async function removeShare(share: PlannerShare) {
    setRemovingId(share.id);
    setNotice(null);
    const { error } = await supabase.from('planner_shares').delete().eq('id', share.id);
    setRemovingId(null);
    if (error) {
      setFormError('We could not remove that person. Please try again.');
      return;
    }
    setNotice(`${share.email ?? 'That person'} can no longer view this planner.`);
    await loadShares();
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 leading-tight">Share planner</h1>
        <p className="text-gray-500 text-sm mt-2 leading-relaxed">
          Invite someone to view {scheme.name}. Viewers can see every page, figure, and Ask Claude chat, but cannot change anything.
        </p>
      </div>

      <form onSubmit={handleShare} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <Share2 size={18} />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 leading-tight">Invite a viewer</h2>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Field label="Email address" icon={<span className="text-xs">@</span>}>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputClass}
                placeholder="name@company.com"
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="sm:self-end inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 px-5 py-3 text-sm font-semibold text-white transition-colors duration-150"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
        </div>

        {formError && <ErrorBox message={formError} />}
        {notice && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{notice}</div>
        )}
      </form>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 leading-tight">People with access</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-12 text-gray-500 text-sm">
            <Loader2 size={18} className="animate-spin" />
            Loading…
          </div>
        ) : loadError ? (
          <div className="p-6">
            <ErrorBox message={loadError} />
          </div>
        ) : shares.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500">Nobody else can view this planner yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {shares.map(share => (
              <li key={share.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
                    <Eye size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{share.email ?? 'Unknown address'}</p>
                    <p className="text-xs text-gray-500">Can view</p>
                  </div>
                </div>
                <button
                  onClick={() => removeShare(share)}
                  disabled={removingId === share.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700 disabled:opacity-50 transition-colors duration-150"
                >
                  {removingId === share.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
