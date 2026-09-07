import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
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
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) { console.error('profile load', error); return; }
    if (data) { setProfile(data as Profile); return; }
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
        first_name: role === 'trainer' ? 'Peter' : null,
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (session) await loadProfile(session.user.id);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
