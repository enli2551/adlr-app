import { useEffect, useState } from 'react';
import { ClipboardCheck, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { t, fmtDate, fmtNum } from '@/lib/i18n';
import type { WeeklyCheckin } from '@/lib/engagement';

const SCALES: { key: 'energy' | 'sleep' | 'stress' | 'nutrition'; label: string; invert?: boolean }[] = [
  { key: 'energy', label: 'Energie' },
  { key: 'sleep', label: 'Schlaf' },
  { key: 'stress', label: 'Stress', invert: true },
  { key: 'nutrition', label: 'Ernährung' },
];

function tone(v: number | null, invert?: boolean): string {
  if (v == null) return 'text-white/30';
  const good = invert ? v <= 2 : v >= 4;
  const bad = invert ? v >= 4 : v <= 2;
  return good ? 'text-emerald-400' : bad ? 'text-red-400' : 'text-white/70';
}

/** Trainer ClientDetail: the client's weekly check-ins, newest first, with a reply box. */
export default function ClientCheckins({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<WeeklyCheckin[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from('weekly_checkins').select('*').eq('client_id', clientId).order('week_start', { ascending: false }).limit(8);
    setRows(error ? null : ((data ?? []) as WeeklyCheckin[]));
  };
  useEffect(() => { load(); }, [clientId]);

  if (!rows || rows.length === 0) return null;

  const reply = async (c: WeeklyCheckin) => {
    const text = (drafts[c.id] ?? '').trim();
    if (!text) return;
    setBusy(c.id);
    await supabase.from('weekly_checkins').update({ trainer_reply: text, replied_at: new Date().toISOString() }).eq('id', c.id);
    // The client sees the answer in the chat (live) — that's where they look.
    await supabase.from('messages').insert({ client_id: clientId, sender: 'trainer', body: `${t('Zu deinem Check-in')}: ${text}` });
    setDrafts((d) => ({ ...d, [c.id]: '' }));
    setBusy(null);
    load();
  };

  return (
    <div className="adlr-card p-5 mb-4">
      <p className="text-sm font-medium text-white/80 flex items-center gap-2 mb-3"><ClipboardCheck size={16} className="text-adlr-gold" /> {t('Wöchentliche Check-ins')}</p>
      <div className="space-y-4">
        {rows.map((c, i) => (
          <div key={c.id} className={i > 0 ? 'pt-4 border-t border-white/5' : ''}>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm font-semibold text-white">{t('Woche ab {date}', { date: fmtDate(c.week_start, { day: 'numeric', month: 'short' }) })}</p>
              {c.weight_kg != null && <span className="text-xs text-white/60">{fmtNum(Number(c.weight_kg))} kg</span>}
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {SCALES.map((s) => (
                <div key={s.key} className="rounded-lg py-1.5 text-center" style={{ background: 'rgb(var(--text) / 0.04)' }}>
                  <p className={`text-base font-bold ${tone(c[s.key], s.invert)}`}>{c[s.key] ?? '–'}</p>
                  <p className="text-[10px] text-white/40">{t(s.label)}</p>
                </div>
              ))}
            </div>
            {c.wins && <p className="text-xs text-white/70 mb-1"><span className="text-emerald-400">＋</span> {c.wins}</p>}
            {c.struggles && <p className="text-xs text-white/70 mb-1"><span className="text-red-400">－</span> {c.struggles}</p>}
            {c.trainer_reply ? (
              <p className="text-xs text-adlr-gold/80 mt-2">{t('Deine Antwort')}: {c.trainer_reply}</p>
            ) : (
              <div className="flex gap-2 mt-2">
                <input value={drafts[c.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                  placeholder={t('Kurz antworten…')} onKeyDown={(e) => e.key === 'Enter' && reply(c)}
                  className="flex-1 bg-inset border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                <button onClick={() => reply(c)} disabled={busy === c.id || !(drafts[c.id] ?? '').trim()} aria-label={t('Senden')}
                  className="adlr-tap px-3 rounded-xl disabled:opacity-40" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}><Send size={15} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
