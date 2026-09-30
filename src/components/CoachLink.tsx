import { useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, Copy, Share2, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-6 adlr-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5 bg-adlr-anthracite relative" style={{ border: '1px solid rgb(var(--text) / 0.1)' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="adlr-tap absolute right-3 top-3 p-1.5 text-white/40" aria-label={t('Schließen')}><X size={18} /></button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Trainer: "Klient einladen" — shows the trainer's invite code with copy/share. */
export function InviteClientsButton() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { profile } = useAuth();

  const openSheet = async () => {
    setOpen(true);
    if (code) return;
    const { data, error } = await supabase.rpc('my_invite_code');
    if (error) setErr(t('Code konnte nicht geladen werden (Migration ausgeführt?)'));
    else setCode(data as string);
  };

  const text = code ? t('Trainiere mit mir in der ADLR-App! Lade die App herunter und gib beim Registrieren meinen Code ein: {code}', { code }) : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: 'ADLR', text }); } catch { /* cancelled */ } } else copy();
  };

  return (
    <>
      <button onClick={openSheet} className="adlr-tap flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
        <UserPlus size={14} /> {t('Einladen')}
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <p className="text-base font-semibold text-white flex items-center gap-2"><UserPlus size={16} className="text-adlr-gold" /> {t('Klienten einladen')}</p>
          <p className="text-xs text-white/50 mt-1 mb-4">{t('Deine Klienten geben diesen Code beim Registrieren ein — dann sind sie automatisch mit dir verbunden.')}</p>
          {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
          <div className="rounded-2xl py-5 text-center mb-4" style={{ background: 'rgb(var(--adlr-gold) / 0.1)', border: '1px solid rgb(var(--adlr-gold) / 0.35)' }}>
            <p className="text-3xl font-extrabold tracking-[0.35em] text-adlr-gold pl-[0.35em]">{code ?? '······'}</p>
            {profile?.first_name && <p className="text-xs text-white/45 mt-1">{t('Coach: {name}', { name: profile.first_name })}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={copy} disabled={!code} className="adlr-tap flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-white/80 flex items-center justify-center gap-1.5 disabled:opacity-40">
              {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />} {copied ? t('Kopiert') : t('Kopieren')}
            </button>
            <button onClick={share} disabled={!code} className="adlr-tap flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
              <Share2 size={15} /> {t('Teilen')}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Client: enter / change the coach invite code (Profile → Settings). */
export function JoinCoachSheet({ onClose }: { onClose: () => void }) {
  const { refreshProfile, coach } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const join = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc('join_trainer', { p_code: code.trim() });
    setBusy(false);
    if (error || data === null) { setMsg({ ok: false, text: t('Code nicht gefunden. Bitte prüfe die Schreibweise.') }); return; }
    await refreshProfile();
    setMsg({ ok: true, text: t('Verbunden mit {name}!', { name: (data as string) || t('deinem Coach') }) });
    setTimeout(onClose, 1200);
  };

  return (
    <Sheet onClose={onClose}>
      <p className="text-base font-semibold text-white flex items-center gap-2"><UserPlus size={16} className="text-adlr-gold" /> {t('Coach')}</p>
      <p className="text-xs text-white/50 mt-1 mb-4">
        {coach?.first_name ? t('Du trainierst aktuell mit {name}. Mit einem neuen Code wechselst du deinen Coach.', { name: coach.first_name }) : t('Gib den Einladungscode deines Coaches ein.')}
      </p>
      <input
        autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={12}
        onKeyDown={(e) => { if (e.key === 'Enter') join(); }}
        className="w-full bg-inset border border-white/10 rounded-xl px-4 py-3.5 text-white text-center text-lg tracking-[0.3em] placeholder-white/20 outline-none mb-3"
      />
      {msg && <p className={`text-sm mb-3 text-center ${msg.ok ? 'text-green-500' : 'text-red-400'}`}>{msg.text}</p>}
      <button onClick={join} disabled={busy || !code.trim()} className="adlr-tap w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
        {busy ? '…' : t('Verbinden')}
      </button>
    </Sheet>
  );
}
