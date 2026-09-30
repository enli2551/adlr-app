import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';
import { Button, Field, Input } from '@/components/ui';
import { Eye, EyeOff } from 'lucide-react';
import { t } from '@/lib/i18n';
import { LanguagePill } from '@/components/LanguageSwitcher';

// Supabase auth errors arrive in English — map the common ones to a friendly, translated text.
const AUTH_ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-Mail oder Passwort ist falsch.'],
  [/email not confirmed/i, 'Bitte bestätige zuerst deine E-Mail-Adresse.'],
  [/password should be at least/i, 'Passwort: mindestens 6 Zeichen.'],
  [/unable to validate email|invalid email/i, 'Ungültige E-Mail-Adresse.'],
  [/for security purposes|rate limit|too many/i, 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.'],
  [/failed to fetch|network/i, 'Keine Verbindung. Bitte prüfe deine Internetverbindung.'],
];
const authError = (msg: string) => {
  const hit = AUTH_ERRORS.find(([re]) => re.test(msg));
  return hit ? t(hit[1]) : msg;
};

export default function AuthScreen() {
  const { signIn, signUp, session, profile, loading, refreshProfile } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const isTrainer = loc.pathname === '/trainer-auth';

  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Coach invite code — prefilled from an invite link (…/auth?code=ABC123).
  const [inviteCode, setInviteCode] = useState(() => new URLSearchParams(loc.search).get('code')?.toUpperCase() ?? '');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Password reset via in-app OTP code (no website / deep link needed)
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false); // OTP + new-password stage
  const [otpCode, setOtpCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPwBusy, setNewPwBusy] = useState(false);
  const [newPwDone, setNewPwDone] = useState(false);

  useEffect(() => {
    if (recovery || newPwDone) return; // stay on the reset form
    if (loading || !session || !profile) return;
    if (profile.role === 'trainer') {
      nav('/trainer', { replace: true });
    } else if (profile.intake_completed) {
      nav('/app', { replace: true });
    } else {
      nav('/onboarding', { replace: true });
    }
  }, [session, profile, loading, nav, recovery, newPwDone]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const role = isTrainer ? 'trainer' : 'client';
      const res = mode === 'signup' ? await signUp(email, password, role) : await signIn(email, password);
      if (res.error) { setError(authError(res.error)); return; }
      if (mode === 'signup' && !isTrainer && inviteCode.trim()) {
        const { data: coachName } = await supabase.rpc('join_trainer', { p_code: inviteCode.trim() });
        if (coachName === null) setError(t('Einladungscode nicht gefunden — du kannst ihn später im Profil eingeben.'));
        await refreshProfile();
      }
    } catch (err) {
      // Surface the real error instead of an unhandled rejection.
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Step 1: send a recovery e-mail. Supabase includes a 6-digit code ({{ .Token }}
  // in the "Reset Password" email template) which the user types into the app —
  // no website or deep link required.
  const forgotPassword = async () => {
    setError(null);
    setResetMsg(null);
    if (!email.trim()) { setError(t('Gib zuerst deine E-Mail-Adresse ein.')); return; }
    setResetBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
    setResetBusy(false);
    if (err) { setError(authError(err.message)); return; }
    setRecovery(true);
    setResetMsg(t('Wir haben dir einen Code per E-Mail geschickt. Gib ihn unten ein.'));
  };

  // Step 2: verify the emailed code, then set the new password.
  const updatePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const code = otpCode.replace(/\s/g, '');
    if (code.length < 6) { setError(t('Gib den 6-stelligen Code aus der E-Mail ein.')); return; }
    if (newPw.length < 6) { setError(t('Neues Passwort: mindestens 6 Zeichen.')); return; }
    setNewPwBusy(true);
    const { error: vErr } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' });
    if (vErr) { setNewPwBusy(false); setError(t('Code ungültig oder abgelaufen. Bitte neu anfordern.')); return; }
    const { error: uErr } = await supabase.auth.updateUser({ password: newPw });
    setNewPwBusy(false);
    if (uErr) { setError(authError(uErr.message)); return; }
    setNewPwDone(true);
    await supabase.auth.signOut();
    setTimeout(() => {
      setRecovery(false); setNewPwDone(false); setOtpCode(''); setNewPw('');
      setResetMsg(null); setMode('login');
    }, 1800);
  };

  const pwToggle = (show: boolean, set: (v: boolean) => void) => (
    <button type="button" onClick={() => set(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 adlr-tap" aria-label={show ? t('Passwort verbergen') : t('Passwort anzeigen')}>
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  // ── Reset screen: enter emailed code + choose a new password (in-app, no website) ──
  if (recovery) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 adlr-fade-in">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-10"><Logo size={40} showTagline /></div>
          <h1 className="text-lg font-bold text-white text-center mb-1">{t('Passwort zurücksetzen')}</h1>
          <p className="text-sm text-white/50 text-center mb-6">
            {t('Gib den Code aus der E-Mail an')} <span className="text-white/70">{email}</span> {t('ein und wähle ein neues Passwort.')}
          </p>
          {newPwDone ? (
            <p className="text-sm text-center" style={{ color: '#22c55e' }}>{t('Passwort geändert! Du kannst dich jetzt anmelden.')}</p>
          ) : (
            <form onSubmit={updatePassword} className="space-y-4">
              <Field label={t('Code aus der E-Mail')}>
                <Input type="text" inputMode="numeric" autoComplete="one-time-code" required value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)} placeholder={t('6-stelliger Code')}
                  className="tracking-[0.3em] text-center" />
              </Field>
              <Field label={t('Neues Passwort')}>
                <div className="relative">
                  <Input type={showPw ? 'text' : 'password'} required minLength={6} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder={t('Mindestens 6 Zeichen')} className="pr-11" />
                  {pwToggle(showPw, setShowPw)}
                </div>
              </Field>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" disabled={newPwBusy} className="w-full">{newPwBusy ? t('Speichert...') : t('Passwort speichern')}</Button>
              <button type="button" onClick={() => { setRecovery(false); setError(null); setResetMsg(null); setOtpCode(''); }}
                className="block mx-auto text-xs text-white/40 hover:text-white/70">
                {t('Zurück zur Anmeldung')}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 adlr-fade-in">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-6"><LanguagePill /></div>
        <div className="flex flex-col items-center mb-10">
          <Logo size={40} showTagline />
        </div>

        <div className="flex gap-1 p-1 bg-inset rounded-xl mb-6 border border-white/5">
          <button
            onClick={() => { setMode('signup'); setResetMsg(null); setError(null); }}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={mode === 'signup' ? { background: 'rgb(var(--adlr-gold))', color: '#000', fontWeight: 600 } : { background: 'transparent', color: 'rgb(var(--text) / 0.55)' }}
          >
            {isTrainer ? t('Trainer Zugang') : t('Konto erstellen')}
          </button>
          <button
            onClick={() => { setMode('login'); setResetMsg(null); setError(null); }}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={mode === 'login' ? { background: 'rgb(var(--adlr-gold))', color: '#000', fontWeight: 600 } : { background: 'transparent', color: 'rgb(var(--text) / 0.55)' }}
          >
            {t('Anmelden')}
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label={t('E-Mail')}>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('deine@email.at')} />
          </Field>
          <Field label={t('Passwort')}>
            <div className="relative">
              <Input type={showPw ? 'text' : 'password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('Mindestens 6 Zeichen')} className="pr-11" />
              {pwToggle(showPw, setShowPw)}
            </div>
          </Field>
          {mode === 'signup' && !isTrainer && (
            <Field label={t('Einladungscode deines Coaches')} hint={t('Optional — du findest ihn in der Einladung deines Coaches.')}>
              <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={12} autoCapitalize="characters" className="tracking-[0.25em]" />
            </Field>
          )}
          {error && <p className="text-sm text-red-400 break-words">{error}</p>}
          {resetMsg && <p className="text-sm" style={{ color: '#22c55e' }}>{resetMsg}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t('Lädt...') : mode === 'signup' ? (isTrainer ? t('Trainer Konto erstellen') : t('Jetzt beginnen')) : t('Einloggen')}
          </Button>
        </form>

        {mode === 'login' && (
          <button onClick={forgotPassword} disabled={resetBusy} className="block mx-auto mt-4 text-xs text-adlr-gold/70 hover:text-adlr-gold disabled:opacity-50">
            {resetBusy ? t('Sende…') : t('Passwort vergessen?')}
          </button>
        )}

        <p className="text-center text-xs text-white/30 mt-6">
          {isTrainer ? t('Zugang für Personal Trainer') : t('Bereit aufzusteigen? Starte jetzt.')}
        </p>
        <div className="flex justify-center gap-4 mt-3 text-xs">
          <button onClick={() => nav(isTrainer ? '/auth' : '/trainer-auth')} className="text-adlr-gold/60 hover:text-adlr-gold">
            {isTrainer ? t('Ich bin Klient') : t('Ich bin Trainer')}
          </button>
        </div>
      </div>
    </div>
  );
}
