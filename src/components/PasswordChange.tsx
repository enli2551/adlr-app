import { useState, type FormEvent } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useCaptcha } from '@/lib/captcha';
import { t } from '@/lib/i18n';

/** Change the password while logged in. Works without access to the account's e-mail:
 *  the current password is checked by signing in again, then the new one is set. */
export default function PasswordChange({ onDone }: { onDone?: () => void }) {
  const { session } = useAuth();
  const email = session?.user.email ?? '';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const captcha = useCaptcha();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!current) { setError(t('Gib dein aktuelles Passwort ein.')); return; }
    if (next.length < 8) { setError(t('Neues Passwort: mindestens 8 Zeichen.')); return; }
    if (next !== repeat) { setError(t('Die neuen Passwörter stimmen nicht überein.')); return; }
    if (next === current) { setError(t('Das neue Passwort muss sich vom alten unterscheiden.')); return; }
    if (!captcha.ready) { setError(t('Bitte bestätige kurz, dass du kein Roboter bist.')); return; }
    setBusy(true);
    const { error: sErr } = await supabase.auth.signInWithPassword({ email, password: current, options: { captchaToken: captcha.token } });
    captcha.reset();
    if (sErr) {
      setBusy(false);
      setError(/invalid login credentials/i.test(sErr.message) ? t('Aktuelles Passwort ist falsch.') : t('Keine Verbindung. Bitte später erneut versuchen.'));
      return;
    }
    const { error: uErr } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (uErr) {
      const code = (uErr as { code?: string }).code;
      setError(code === 'weak_password' ? t('Dieses Passwort ist zu schwach. Wähle ein längeres.')
        : code === 'same_password' ? t('Das neue Passwort muss sich vom alten unterscheiden.')
        : t('Passwort konnte nicht geändert werden. Bitte später erneut versuchen.'));
      return;
    }
    setDone(true);
    setCurrent(''); setNext(''); setRepeat('');
    if (onDone) setTimeout(onDone, 1500);
  };

  if (done) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-400 py-2">
        <Check size={16} /> {t('Passwort geändert.')}
      </p>
    );
  }

  const input = 'w-full bg-inset border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none';
  return (
    <form onSubmit={submit} className="space-y-2">
      {/* hidden username so password managers save the new password for the right account */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <div className="relative">
        <input type={show ? 'text' : 'password'} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)}
          placeholder={t('Aktuelles Passwort')} className={`${input} pr-10`} />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 adlr-tap"
          aria-label={show ? t('Passwort verbergen') : t('Passwort anzeigen')}>
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      <input type={show ? 'text' : 'password'} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)}
        placeholder={t('Neues Passwort')} className={input} />
      <input type={show ? 'text' : 'password'} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)}
        placeholder={t('Neues Passwort wiederholen')} className={input} />
      {captcha.element}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="adlr-tap w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
        style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
        {busy ? '…' : t('Passwort ändern')}
      </button>
    </form>
  );
}
