import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCoachName } from '@/lib/auth';
import { t, fmtDate } from '@/lib/i18n';
import { dueCheckinWeek, scheduleCheckinReminder, type WeeklyCheckin } from '@/lib/engagement';

const SCALES: { key: 'energy' | 'sleep' | 'stress' | 'nutrition'; label: string; low: string; high: string }[] = [
  { key: 'energy', label: 'Energie', low: 'leer', high: 'voller Energie' },
  { key: 'sleep', label: 'Schlaf', low: 'schlecht', high: 'sehr gut' },
  { key: 'stress', label: 'Stress', low: 'entspannt', high: 'sehr hoch' },
  { key: 'nutrition', label: 'Ernährung nach Plan', low: 'gar nicht', high: 'voll' },
];

type Form = { weight: string; energy: number | null; sleep: number | null; stress: number | null; nutrition: number | null; wins: string; struggles: string };

/** Client Training screen: the weekly check-in (Fri–Mon), one minute, answered by the coach. */
export default function WeeklyCheckinCard({ clientId, lastWeight }: { clientId: string; lastWeight: number | null }) {
  const coach = useCoachName();
  const week = dueCheckinWeek();
  const [state, setState] = useState<'loading' | 'due' | 'done' | 'hidden'>('loading');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ weight: lastWeight ? String(lastWeight) : '', energy: null, sleep: null, stress: null, nutrition: null, wins: '', struggles: '' });

  useEffect(() => {
    if (!week) { setState('hidden'); return; }
    supabase.from('weekly_checkins').select('id').eq('client_id', clientId).eq('week_start', week).maybeSingle()
      .then(({ data, error }) => {
        if (error) { setState('hidden'); return; } // migration not run yet
        setState(data ? 'done' : 'due');
        scheduleCheckinReminder(!!data, coach);
      });
  }, [clientId, week]);

  if (state === 'loading' || state === 'hidden' || !week) return null;
  if (state === 'done' && !open) return null;

  const submit = async () => {
    setSaving(true); setErr(null);
    const weight = form.weight ? Number(form.weight.replace(',', '.')) : null;
    const { error } = await supabase.from('weekly_checkins').upsert({
      client_id: clientId, week_start: week, weight_kg: weight,
      energy: form.energy, sleep: form.sleep, stress: form.stress, nutrition: form.nutrition,
      wins: form.wins.trim() || null, struggles: form.struggles.trim() || null,
    }, { onConflict: 'client_id,week_start' });
    if (error) { setSaving(false); setErr(t('Konnte nicht gespeichert werden.')); return; }
    // Weight also lands in the progress chart.
    if (weight && weight !== lastWeight) await supabase.from('progress_entries').insert({ client_id: clientId, weight_kg: weight });
    // Let the coach know in the chat thread.
    await supabase.from('messages').insert({ client_id: clientId, sender: 'client', body: t('✅ Wöchentlicher Check-in ausgefüllt') });
    scheduleCheckinReminder(true, coach);
    setSaving(false);
    setState('done');
  };

  return (
    <>
      {state === 'due' && (
        <button onClick={() => setOpen(true)} className="adlr-tap w-full adlr-card adlr-gold-border p-4 mb-4 flex items-center gap-3 text-left">
          <ClipboardCheck size={20} className="text-adlr-gold shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-white">{t('Wöchentlicher Check-in')}</span>
            <span className="block text-xs text-white/55">{t('1 Minute — {coach} passt deinen Plan daran an.', { coach })}</span>
          </span>
          <span className="text-xs font-semibold text-adlr-gold">{t('Los')}</span>
        </button>
      )}
      {open && createPortal(
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-end justify-center adlr-fade-in" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-5 bg-adlr-anthracite" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-lg font-bold text-white">{t('Wöchentlicher Check-in')}</p>
                <p className="text-xs text-white/45">{t('Woche ab {date}', { date: fmtDate(week, { day: 'numeric', month: 'long' }) })}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label={t('Schließen')} className="adlr-tap p-1.5 text-white/40"><X size={18} /></button>
            </div>
            {state === 'done' ? (
              <div className="py-8 text-center">
                <Check size={36} className="text-adlr-gold mx-auto mb-3" />
                <p className="text-white font-semibold">{t('Danke! {coach} schaut sich das an.', { coach })}</p>
                <button onClick={() => setOpen(false)} className="adlr-tap mt-6 px-6 py-2.5 rounded-xl text-sm bg-white/5 text-white/70">{t('Schließen')}</button>
              </div>
            ) : (
              <div className="space-y-5">
                <label className="block">
                  <span className="text-xs text-white/50">{t('Gewicht (kg)')}</span>
                  <input inputMode="decimal" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })}
                    className="mt-1 w-full bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-white outline-none" placeholder="80,5" />
                </label>
                {SCALES.map((s) => (
                  <div key={s.key}>
                    <p className="text-sm text-white/80 mb-2">{t(s.label)}</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => setForm({ ...form, [s.key]: n })}
                          className={`adlr-tap py-2.5 rounded-lg text-sm font-semibold border ${form[s.key] === n ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/60 border-white/10'}`}>{n}</button>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-white/35 mt-1"><span>{t(s.low)}</span><span>{t(s.high)}</span></div>
                  </div>
                ))}
                <label className="block">
                  <span className="text-sm text-white/80">{t('Was lief gut?')}</span>
                  <textarea rows={2} value={form.wins} onChange={(e) => setForm({ ...form, wins: e.target.value })}
                    className="mt-1 w-full bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-none" />
                </label>
                <label className="block">
                  <span className="text-sm text-white/80">{t('Wo hakt es?')}</span>
                  <textarea rows={2} value={form.struggles} onChange={(e) => setForm({ ...form, struggles: e.target.value })}
                    className="mt-1 w-full bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-none" />
                </label>
                {err && <p className="text-xs text-red-400">{err}</p>}
                <button onClick={submit} disabled={saving} className="adlr-tap w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
                  {saving ? '…' : t('Absenden')}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
