import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';
import { t } from './i18n';
import { cacheGet, cacheSet, isNetworkError } from './offline';
import { setMonitoringUser } from './monitoring';
import { applyBrand, cacheBrand } from './branding';
import { removePushToken } from './push';

/** The client's own coach (or, for a trainer, themselves) — shown instead of a hardcoded name. */
export interface CoachInfo { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; brand_logo?: string | null; brand_color?: string | null }

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

const PROFILE_TIMEOUT_MS = 8000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [coach, setCoach] = useState<CoachInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const signupRole = useRef<'trainer' | 'client' | null>(null);
  useEffect(() => { setMonitoringUser(profile?.id ?? null, profile?.role); }, [profile?.id, profile?.role]);
  // The coach's colour replaces ADLR gold everywhere; remembered for the next start.
  useEffect(() => {
    if (loading) return;
    applyBrand(coach?.brand_color ?? null);
    cacheBrand(coach ? { color: coach.brand_color ?? null, logo: coach.brand_logo ?? null } : null);
  }, [coach?.brand_color, coach?.brand_logo, loading]);

  // Clients: their trainer's name/avatar (RLS lets a client read their own trainer's row).
  const loadCoach = async (p: Profile) => {
    if (p.role === 'trainer') { setCoach({ id: p.id, first_name: p.first_name, last_name: p.last_name, avatar_url: p.avatar_url, brand_logo: p.brand_logo ?? null, brand_color: p.brand_color ?? null }); return; }
    if (!p.trainer_id) { setCoach(null); return; }
    let { data, error } = await supabase.from('profiles').select('id, first_name, last_name, avatar_url, brand_logo, brand_color').eq('id', p.trainer_id).maybeSingle();
    // Branding columns not migrated yet.
    if (error && !isNetworkError(error)) ({ data, error } = await supabase.from('profiles').select('id, first_name, last_name, avatar_url').eq('id', p.trainer_id).maybeSingle());
    if (error && isNetworkError(error)) { setCoach(cacheGet<CoachInfo>(p.id, 'coach')); return; }
    setCoach((data as CoachInfo | null) ?? null);
    if (data) cacheSet(p.id, 'coach', data);
  };

  // Profile load with a time limit: the login must never hang on one slow request.
  const loadProfile = (uid: string) => Promise.race([
    loadProfileNow(uid),
    new Promise<void>((resolve) => setTimeout(() => {
      // Too slow — carry on with the last known profile (if any); the real load still lands later.
      setProfile((p) => p ?? cacheGet<Profile>(uid, 'profile'));
      resolve();
    }, PROFILE_TIMEOUT_MS)),
  ]);

  const loadProfileNow = async (uid: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) {
      // Offline start: keep working from the last known profile (training works offline).
      const cached = isNetworkError(error) ? cacheGet<Profile>(uid, 'profile') : null;
      if (cached) { setProfile(cached); loadCoach(cached); return; }
      console.error('profile load', error);
      return;
    }
    if (data) { setProfile(data as Profile); cacheSet(uid, 'profile', data); await loadCoach(data as Profile); return; }
    // Profile row missing — create a minimal profile so the app works. During sign-up the
    // auth listener gets here before signUp's own upsert: use the role being signed up for,
    // otherwise a new trainer became a client (the role can't be changed afterwards).
    const { data: user } = await supabase.auth.getUser();
    const email = user?.user?.email ?? '';
    const { data: created, error: cErr } = await supabase
      .from('profiles')
      .insert({ id: uid, email, role: signupRole.current ?? 'client' })
      .select('*')
      .maybeSingle();
    if (cErr?.code === '23505') { // created concurrently (signUp's upsert) — just read it
      const { data: again } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (again) { setProfile(again as Profile); cacheSet(uid, 'profile', again); await loadCoach(again as Profile); }
      return;
    }
    if (cErr) { console.error('profile create', cErr); return; }
    setProfile(created as Profile);
  };

  useEffect(() => {
    let mounted = true;
    // Safety net: the start screen never waits longer than this, whatever hangs.
    const watchdog = setTimeout(() => mounted && setLoading(false), 12000);
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        loadProfile(data.session.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch(() => mounted && setLoading(false)).finally(() => clearTimeout(watchdog));

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
    signupRole.current = role;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      // Account already exists — fall back to sign-in so the user isn't stuck.
      if (error.message.includes('already') || error.message.includes('registered')) {
        return signIn(email, password);
      }
      return { error: error.message };
    }
    if (data.user) {
      // Clients keep an existing coach link only; without an invite code they stay unassigned
      // until a master trainer assigns them (get_trainer_id has no fallback trainer any more).
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
    const pushCleanup = removePushToken(); // needs the session, so before the local sign-out (capped at 1.5 s)
    setProfile(null);
    setCoach(null);
    setSession(null);
    await pushCleanup;
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
  const name = coach?.first_name?.trim() ?? '';
  // Some trainer profiles carry the e-mail as first name (signup fallback) — show "Peter", not "peter@adlr.at".
  if (name.includes('@')) {
    const local = name.split('@')[0].split(/[._-]/)[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : t('dein Coach');
  }
  return name || t('dein Coach');
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
