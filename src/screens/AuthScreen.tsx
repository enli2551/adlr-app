import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import Logo from '@/components/Logo';
import { Button, Field, Input } from '@/components/ui';

export default function AuthScreen() {
  const { signIn, signUp, session, profile, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const isTrainer = loc.pathname === '/trainer-auth';

  useEffect(() => {
    if (loading || !session || !profile) return;
    if (profile.role === 'trainer') {
      nav('/trainer', { replace: true });
    } else if (profile.intake_completed) {
      nav('/app', { replace: true });
    } else {
      nav('/onboarding', { replace: true });
    }
  }, [session, profile, loading, nav]);
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const role = isTrainer ? 'trainer' : 'client';
    const res = mode === 'signup' ? await signUp(email, password, role) : await signIn(email, password);
    setBusy(false);
    if (res.error) setError(res.error);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 adlr-fade-in">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <Logo size={40} showTagline />
        </div>

        <div className="flex gap-1 p-1 bg-inset rounded-xl mb-6 border border-white/5">
          <button
            onClick={() => setMode('signup')}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={mode === 'signup' ? { background: 'rgb(var(--adlr-gold))', color: '#000', fontWeight: 600 } : { background: 'transparent', color: 'rgb(var(--text) / 0.55)' }}
          >
            {isTrainer ? 'Trainer Zugang' : 'Konto erstellen'}
          </button>
          <button
            onClick={() => setMode('login')}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={mode === 'login' ? { background: 'rgb(var(--adlr-gold))', color: '#000', fontWeight: 600 } : { background: 'transparent', color: 'rgb(var(--text) / 0.55)' }}
          >
            Anmelden
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="E-Mail">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="deine@email.at" />
          </Field>
          <Field label="Passwort">
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mindestens 6 Zeichen" />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Lädt...' : mode === 'signup' ? (isTrainer ? 'Trainer Konto erstellen' : 'Jetzt beginnen') : 'Einloggen'}
          </Button>
        </form>

        <p className="text-center text-xs text-white/30 mt-6">
          {isTrainer ? 'Trainer-Zugang für Peter' : 'Bereit aufzusteigen? Starte jetzt.'}
        </p>
        <div className="flex justify-center gap-4 mt-3 text-xs">
          <button onClick={() => nav(isTrainer ? '/auth' : '/trainer-auth')} className="text-adlr-gold/60 hover:text-adlr-gold">
            {isTrainer ? 'Ich bin Klient' : 'Ich bin Trainer'}
          </button>
        </div>
      </div>
    </div>
  );
}
