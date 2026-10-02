import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';
import { t } from './i18n';
import { cacheGet, cacheSet, isNetworkError } from './offline';
import { setMonitoringUser } from './monitoring';

/** The client's own coach (or, for a trainer, themselves) — shown instead of a hardcoded name. */
export interface CoachInfo { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  coach: CoachInfo | null;
  loading: boolean;
  signUp: (email: string, password: string, role: 'trainer' | 'client') => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [coach, setCoach] = useState<CoachInfo | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setMonitoringUser(profile?.id ?? null, profile?.role); }, [profile?.id, profile?.role]);

  // Clients: their trainer's name/avatar (RLS lets a client read their own trainer's row).
  const loadCoach = async (p: Profile) => {
    if (p.role === 'trainer') { setCoach({ id: p.id, first_name: p.first_name, last_name: p.last_name, avatar_url: p.avatar_url }); return; }
    if (!p.trainer_id) { setCoach(null); return; }
    const { data, error } = await supabase.from('profiles').select('id, first_name, last_name, avatar_url').eq('id', p.trainer_id).maybeSingle();
    if (error && isNetworkError(error)) { setCoach(cacheGet<CoachInfo>(p.id, 'coach')); return; }
    setCoach((data as CoachInfo | null) ?? null);
    if (data) cacheSet(p.id, 'coach', data);
  };

  const loadProfile = async (uid: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) {
      // Offline start: keep working from the last known profile (training works offline).
      const cached = isNetworkError(error) ? cacheGet<Profile>(uid, 'profile') : null;
      if (cached) { setProfile(cached); loadCoach(cached); return; }
      console.error('profile load', error);
      return;
    }
    if (data) { setProfile(data as Profile); cacheSet(uid, 'profile', data); loadCoach(data as Profile); return; }
    // Profile row missing — create a minimal client profile so the app works.
    const { data: user } = await supabase.auth.getUser();
    const email = user?.user?.email ?? '';
    const { data: created, error: cErr } = await supabase
      .from('profiles')
      .insert({ id: uid, email, role: 'client' })
      .select('*')
      .maybeSingle();
    if (cErr) { console.error('profile create', cErr); return; }
    setProfile(created as Profile);
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        loadProfile(data.session.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess) {
        (async () => { await loadProfile(sess.user.id); })();
      } else {
        setProfile(null);
        setCoach(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, role: 'trainer' | 'client') => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      // Account already exists — fall back to sign-in so the user isn't stuck.
      if (error.message.includes('already') || error.message.includes('registered')) {
        return signIn(email, password);
      }
      return { error: error.message };
    }
    if (data.user) {
      // For clients, auto-link to the single trainer so they show up in the trainer's client list.
      let trainerId: string | null = null;
      if (role === 'client') {
        const { data: tid } = await supabase.rpc('get_trainer_id');
        trainerId = tid ?? null;
      }
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        role,
        trainer_id: trainerId,
      }, { onConflict: 'id' });
      await loadProfile(data.user.id);
    }
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.user) await loadProfile(data.user.id);
    return { error: null };
  };

  // Sign out locally FIRST and never wait on the network: on iOS the token-revoke call
  // could hang, and the screens kept bouncing between /auth and /app while the session
  // still existed — the app froze. 'local' scope clears the stored session immediately;
  // the server-side revoke is best-effort with a timeout.
  const signOut = async () => {
    setProfile(null);
    setCoach(null);
    setSession(null);
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch { /* ignore — local state is already cleared */ }
  };

  const refreshProfile = async () => {
    if (session) await loadProfile(session.user.id);
  };

  return (
    <AuthContext.Provider value={{ session, profile, coach, loading, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Display name of the coach: the client's trainer, or the trainer themselves. */
export function useCoachName(): string {
  const { coach } = useAuth();
  return coach?.first_name?.trim() || t('dein Coach');
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
