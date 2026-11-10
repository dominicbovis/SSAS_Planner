import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, Power, RefreshCw, ShieldCheck, UserPlus, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { callEdgeFunction } from '../lib/functions';
import type { ManagedUser } from '../types';
import { ErrorBox, Field, inputClass } from '../components/AuthFields';

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusOf(user: ManagedUser): { label: string; className: string } {
  if (!user.isActive) return { label: 'Deactivated', className: 'bg-gray-100 text-gray-600 ring-gray-300' };
  if (user.mustSetPassword) return { label: 'Invitation pending', className: 'bg-amber-50 text-amber-700 ring-amber-300' };
  return { label: 'Active', className: 'bg-green-50 text-green-700 ring-green-300' };
}

export default function UsersAccess() {
  const { session, profile } = useAuth();
  const token = session?.access_token ?? '';

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await callEdgeFunction<{ users: ManagedUser[] }>('admin-users', token, { action: 'list' });
      setUsers(data.users);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function toggleActive(user: ManagedUser) {
    setBusyUserId(user.userId);
    setActionError(null);
    setNotice(null);
    try {
      await callEdgeFunction('admin-users', token, {
        action: 'set-active',
        userId: user.userId,
        active: !user.isActive,
      });
      setNotice(user.isActive ? `${user.email} can no longer sign in.` : `${user.email} can sign in again.`);
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update this account.');
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">Users and Access</h1>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed max-w-2xl">
            Invite people to the planner, decide who can manage accounts, and turn access on or off.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadUsers}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors duration-150"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          <button
            onClick={() => setShowInvite(v => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150"
          >
            {showInvite ? <X size={15} /> : <UserPlus size={15} />}
            {showInvite ? 'Close' : 'Invite someone'}
          </button>
        </div>
      </div>

      {showInvite && (
        <InviteForm
          token={token}
          onInvited={email => {
            setShowInvite(false);
            setNotice(`Invitation sent to ${email}.`);
            loadUsers();
          }}
        />
      )}

      {notice && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{notice}</div>
      )}
      {actionError && <ErrorBox message={actionError} />}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-500 text-sm">
            <Loader2 size={18} className="animate-spin" />
            Loading people…
          </div>
        ) : loadError ? (
          <div className="p-6">
            <ErrorBox message={loadError} />
          </div>
        ) : users.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500">No one has been invited yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-6 py-3">Person</th>
                  <th className="px-6 py-3">Planner</th>
                  <th className="px-6 py-3">Access</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Last signed in</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(user => {
                  const status = statusOf(user);
                  const isSelf = profile?.user_id === user.userId;
                  return (
                    <tr key={user.userId} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-6 py-4 font-medium text-gray-900">{user.email}</td>
                      <td className="px-6 py-4 text-gray-600">{user.plannerName ?? '—'}</td>
                      <td className="px-6 py-4">
                        {user.isAdmin ? (
                          <span className="inline-flex items-center gap-1.5 text-red-700 font-medium">
                            <ShieldCheck size={14} /> Administrator
                          </span>
                        ) : (
                          <span className="text-gray-600">Standard</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{formatDate(user.lastSignInAt)}</td>
                      <td className="px-6 py-4 text-right">
                        {isSelf ? (
                          <span className="text-xs text-gray-400">You</span>
                        ) : (
                          <button
                            onClick={() => toggleActive(user)}
                            disabled={busyUserId === user.userId}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors duration-150"
                          >
                            {busyUserId === user.userId ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                            {user.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InviteForm({ token, onInvited }: { token: string; onInvited: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [plannerName, setPlannerName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      await callEdgeFunction('admin-users', token, {
        action: 'invite',
        email: cleanEmail,
        plannerName: plannerName.trim(),
        isAdmin,
        redirectTo: window.location.origin,
      });
      onInvited(cleanEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invitation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 grid gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <h2 className="text-lg font-semibold text-gray-900 leading-tight">Invite someone</h2>
        <p className="text-gray-500 text-sm mt-1 leading-relaxed">
          They receive an email to set their password. Each invitation creates a new, empty planner for them.
        </p>
      </div>

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

      <Field label="Planner name" icon={<span className="text-xs">#</span>}>
        <input
          type="text"
          required
          maxLength={120}
          value={plannerName}
          onChange={e => setPlannerName(e.target.value)}
          className={inputClass}
          placeholder="e.g. Levels Heritage"
        />
      </Field>

      <label className="md:col-span-2 flex items-start gap-3 rounded-lg border border-gray-200 p-4 cursor-pointer hover:bg-gray-50 transition-colors duration-150">
        <input
          type="checkbox"
          checked={isAdmin}
          onChange={e => setIsAdmin(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
        />
        <span>
          <span className="block text-sm font-medium text-gray-900">Make this person an administrator</span>
          <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
            Administrators can invite people and turn access on or off. They cannot see other people's planners unless those planners are shared with them.
          </span>
        </span>
      </label>

      {error && <div className="md:col-span-2"><ErrorBox message={error} /></div>}

      <div className="md:col-span-2 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {busy ? 'Sending…' : 'Send invitation'}
        </button>
      </div>
    </form>
  );
}
