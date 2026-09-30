import { useEffect, useState } from 'react';
import { MessageSquareQuote, Send, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import { mondayOf } from '@/lib/weeklyRecap';
import type { Profile } from '@/lib/types';

/**
 * Trainer overview: clients who haven't got this week's personal line yet. That line
 * is the last card of the client's weekly recap ("Peter sagt …"). One row per client,
 * tap to write inline; saving upserts weekly_messages (one row per client).
 */
export default function WeeklyMessagesCard({ clients }: { clients: Profile[] }) {
  const [missing, setMissing] = useState<Profile[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const active = clients.filter((c) => c.intake_completed);
    if (active.length === 0) { setMissing([]); return; }
    const since = mondayOf(new Date()).getTime();
    supabase.from('weekly_messages').select('client_id, created_at').in('client_id', active.map((c) => c.id)).then(({ data }) => {
      const fresh = new Set(((data ?? []) as { client_id: string; created_at: string }[])
        .filter((m) => new Date(m.created_at).getTime() >= since).map((m) => m.client_id));
      setMissing(active.filter((c) => !fresh.has(c.id)));
    });
  }, [clients]);

  if (!missing || missing.length === 0) return null;

  const send = async (c: Profile) => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const { error } = await supabase.from('weekly_messages').upsert(
      { client_id: c.id, body, created_at: new Date().toISOString() },
      { onConflict: 'client_id' },
    );
    setBusy(false);
    if (error) return;
    setMissing((m) => (m ?? []).filter((x) => x.id !== c.id));
    setOpen(null);
    setDraft('');
  };

  const rows = showAll ? missing : missing.slice(0, 5);
  return (
    <div className="adlr-card p-5 mb-4">
      <div className="flex items-center gap-3 mb-1">
        <MessageSquareQuote size={18} className="text-adlr-gold" />
        <p className="text-sm font-medium text-white/80">{t('Wochennachricht fehlt')}</p>
        <span className="ml-auto text-adlr-gold font-bold">{missing.length}</span>
      </div>
      <p className="text-xs text-white/40 mb-3">{t('Ein Satz von dir — erscheint als letzte Karte im Wochenrückblick deiner Klienten.')}</p>
      <div className="space-y-1.5">
        {rows.map((c) => (
          <div key={c.id} className="rounded-xl" style={{ background: 'rgb(var(--text) / 0.03)' }}>
            <button onClick={() => { setOpen(open === c.id ? null : c.id); setDraft(''); }} className="adlr-tap w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
              <span className="w-7 h-7 rounded-full bg-adlr-gold/20 text-adlr-gold text-xs font-bold flex items-center justify-center shrink-0">{(c.first_name?.[0] ?? '?').toUpperCase()}</span>
              <span className="flex-1 min-w-0 text-sm text-white/80 truncate">{c.first_name} {c.last_name}</span>
              <ChevronDown size={14} className="text-white/30 transition-transform" style={{ transform: open === c.id ? 'rotate(180deg)' : 'none' }} />
            </button>
            {open === c.id && (
              <div className="flex gap-2 px-3 pb-3 adlr-fade-in">
                <textarea
                  autoFocus rows={2} value={draft} onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('z. B. „Starke Woche, Lukas — diese Woche Fokus auf saubere Kniebeugen.“')}
                  className="flex-1 bg-inset border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none resize-none"
                />
                <button onClick={() => send(c)} disabled={busy || !draft.trim()} className="adlr-tap px-3 rounded-lg disabled:opacity-40" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }} aria-label={t('Senden')}>
                  <Send size={15} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {missing.length > 5 && (
        <button onClick={() => setShowAll(!showAll)} className="adlr-tap w-full pt-2 text-xs font-medium text-adlr-gold">
          {showAll ? t('Weniger anzeigen') : t('Alle {n} anzeigen', { n: missing.length })}
        </button>
      )}
    </div>
  );
}
