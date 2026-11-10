import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from '../types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  profileError: boolean;
  loading: boolean;
  recovering: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  finishPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    setProfileError(error !== null);
    setProfile(error ? null : (data as Profile | null));
  }, []);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      (async () => {
        setSession(next);
        if (event === 'PASSWORD_RECOVERY') setRecovering(true);
        if (event === 'SIGNED_OUT') {
          setRecovering(false);
          setProfile(null);
          setProfileError(false);
        }
        if (next) await loadProfile(next.user.id);
        setLoading(false);
      })();
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id);
  }

  function finishPasswordRecovery() {
    setRecovering(false);
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, profileError, loading, recovering, signOut, refreshProfile, finishPasswordRecovery }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
