import { useState, type FormEvent } from 'react';
import { ArrowRight, Loader2, Mail, Lock, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ErrorBox, Field, inputClass } from '../components/AuthFields';

type Mode = 'sign-in' | 'forgot';

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes('invalid')
          ? 'That email and password do not match. Please try again.'
          : 'We could not sign you in. Please try again in a moment.',
      );
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (resetError) {
      setError('We could not send the reset link. Please try again in a moment.');
      return;
    }
    setNotice('If that address has an account, a link to set a new password is on its way.');
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

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {mode === 'sign-in' ? (
            <form onSubmit={handleSignIn} className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">Sign in</h1>
                <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                  Use the email address your invitation was sent to.
                </p>
              </div>

              <Field label="Email" icon={<Mail size={16} />}>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@company.com"
                />
              </Field>

              <Field label="Password" icon={<Lock size={16} />}>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Your password"
                />
              </Field>

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold text-sm py-3 transition-colors duration-150"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                {busy ? 'Signing in…' : 'Sign in'}
              </button>

              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="w-full text-sm text-gray-600 hover:text-red-600 transition-colors duration-150"
              >
                Forgot your password?
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgot} className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">Reset your password</h1>
                <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                  Enter your email and we will send you a link to choose a new password.
                </p>
              </div>

              <Field label="Email" icon={<Mail size={16} />}>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@company.com"
                />
              </Field>

              {error && <ErrorBox message={error} />}
              {notice && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                  {notice}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold text-sm py-3 transition-colors duration-150"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {busy ? 'Sending…' : 'Send reset link'}
              </button>

              <button
                type="button"
                onClick={() => switchMode('sign-in')}
                className="w-full inline-flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-red-600 transition-colors duration-150"
              >
                <ArrowLeft size={14} />
                Back to sign in
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">Accounts are created by invitation only.</p>
      </div>
    </div>
  );
}
