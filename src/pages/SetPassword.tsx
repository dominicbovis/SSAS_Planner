import { useState, type FormEvent } from 'react';
import { Check, Loader2, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ErrorBox, Field, inputClass } from '../components/AuthFields';

const MIN_LENGTH = 8;

export default function SetPassword() {
  const { session, refreshProfile, finishPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Please use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError('We could not save your password. Please try again.');
      return;
    }

    if (session) {
      const { error: flagError } = await supabase
        .from('profiles')
        .update({ must_set_password: false })
        .eq('user_id', session.user.id);
      if (flagError) {
        setBusy(false);
        setError('Your password was saved, but we could not finish setting up your account. Please refresh the page.');
        return;
      }
    }

    await refreshProfile();
    finishPasswordRecovery();
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-12 font-sans">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-sm">
            <span className="text-white font-black text-sm">RH</span>
          </div>
          <div>
            <p className="text-gray-900 font-bold text-base leading-tight">Red Horizons</p>
            <p className="text-gray-500 text-sm">SSAS Planner</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">Choose your password</h1>
            <p className="text-gray-500 text-sm mt-2 leading-relaxed">
              Set a password to finish getting into your planner. Use at least {MIN_LENGTH} characters.
            </p>
          </div>

          <Field label="New password" icon={<Lock size={16} />}>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Confirm password" icon={<Lock size={16} />}>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className={inputClass}
            />
          </Field>

          {error && <ErrorBox message={error} />}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold text-sm py-3 transition-colors duration-150"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {busy ? 'Saving…' : 'Save password and continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
