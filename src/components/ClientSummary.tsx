import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, Footprints, Clock, Scale, HeartPulse, Trash2, StickyNote, Utensils, Pencil } from 'lucide-react';
import { suggestKcalTarget, fmtKcal } from '@/lib/nutrition';
import { supabase } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';
import { computeAttention, type AttentionItem } from '@/lib/attention';
import type { Profile, WorkoutCompletion, ExerciseSetLog, ProgressEntry, ClientPlan } from '@/lib/types';
import { t, fmtDate } from '@/lib/i18n';

interface Props {
  client: Profile;
  completions: WorkoutCompletion[];
  setLogs: ExerciseSetLog[];
  entries: ProgressEntry[];
  activePlan: ClientPlan | null;
  muscleOf: (exercise: string) => string;
}

interface Note { id: string; body: string; created_at: string }

const DAY = 86400000;
const ago = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return t('gerade eben');
  if (h < 24) return t('vor {n} Std.', { n: h });
  const d = Math.floor(ms / DAY);
  return d === 1 ? t('gestern') : t('vor {n} Tagen', { n: d });
};
const weekStartOf = (offsetWeeks: number) => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
};
const tagLabel = (a: AttentionItem) => {
  switch (a.kind) {
    case 'message': return t('Wartet auf Antwort');
    case 'no_plan': return t('Kein aktiver Plan');
    case 'behind': return t('Wochenziel in Gefahr');
    case 'low_checkin': return t('Niedrige Energie/Stimmung');
    case 'inactive': return a.days == null ? t('Seit 5+ Wochen inaktiv') : t('Seit {n} Tagen inaktiv', { n: a.days });
  }
};

/** Trainerize-style at-a-glance block for the top of the trainer's client page. */
export default function ClientSummary({ client, completions, setLogs, entries, activePlan, muscleOf }: Props) {
  const [target, setTarget] = useState(0);
  const [tags, setTags] = useState<AttentionItem[]>([]);
  const [healthRows, setHealthRows] = useState<{ day: string; kcal_in: number | null; updated_at: string }[]>([]);
  const [kcalTarget, setKcalTarget] = useState<number | null>(client.kcal_target ?? null);
  const [editingKcal, setEditingKcal] = useState(false);
  const [kcalDraft, setKcalDraft] = useState('');
  const [kcalErr, setKcalErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState('');
  const [showAllNotes, setShowAllNotes] = useState(false);

  const loadNotes = async () => {
    const { data } = await supabase.from('session_notes').select('id, body, created_at').eq('client_id', client.id).order('created_at', { ascending: false });
    setNotes((data ?? []) as Note[]);
  };

  useEffect(() => {
    (async () => {
      const since = localDateKey(new Date(Date.now() - 6 * DAY));
      const [pd, hd, att] = await Promise.all([
        activePlan ? supabase.from('plan_days').select('is_rest_day').eq('plan_id', activePlan.plan_id) : Promise.resolve({ data: [] as { is_rest_day: boolean }[] }),
        supabase.from('health_daily').select('day, kcal_in, updated_at').eq('client_id', client.id).gte('day', since).order('day', { ascending: true }),
        computeAttention([client]).catch(() => [] as AttentionItem[]),
      ]);
      setTarget(((pd.data ?? []) as { is_rest_day: boolean }[]).filter((d) => !d.is_rest_day).length);
      setHealthRows((hd.data ?? []) as { day: string; kcal_in: number | null; updated_at: string }[]);
      setTags(att);
    })();
    loadNotes();
  }, [client.id, activePlan?.plan_id]);

  // Weekly compliance: trainings done vs. the plan's weekly target (2 weeks ago → this week)
  const weeks = useMemo(() => [2, 1, 0].map((w) => {
    const start = weekStartOf(w);
    const end = new Date(start.getTime() + 7 * DAY);
    const done = completions.filter((c) => { const d = new Date(c.completed_at); return d >= start && d < end; }).length;
    return { label: w === 0 ? t('Diese Woche') : w === 1 ? t('Letzte Woche') : t('Vor 2 Wochen'), done, pct: target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0 };
  }), [completions, target]);

  // Cardio split: pure cardio sessions vs. strength sessions with a cardio part
  // (e.g. incline walk as warm-up/finisher), plus cardio minutes this week.
  const cardio = useMemo(() => {
    const bySession = new Map<string, { cardio: boolean; other: boolean }>();
    const weekStart = weekStartOf(0);
    let minutesThisWeek = 0;
    for (const l of setLogs) {
      if (!l.workout_completion_id) continue;
      const isCardio = l.duration_sec != null || l.distance_km != null || muscleOf(l.exercise_name) === 'Cardio';
      const s = bySession.get(l.workout_completion_id) ?? { cardio: false, other: false };
      if (isCardio) s.cardio = true; else s.other = true;
      bySession.set(l.workout_completion_id, s);
      if (l.duration_sec && new Date(l.created_at) >= weekStart) minutesThisWeek += l.duration_sec / 60;
    }
    let pure = 0, mixed = 0;
    for (const s of bySession.values()) {
      if (s.cardio && !s.other) pure++;
      else if (s.cardio) mixed++;
    }
    return { pure, mixed, minutesThisWeek: Math.round(minutesThisWeek) };
  }, [setLogs, muscleOf]);

  const lastTraining = completions.reduce<string | null>((m, c) => (!m || c.completed_at > m ? c.completed_at : m), null);

  const weights = entries.filter((e) => e.weight_kg != null).sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  const latestW = weights[weights.length - 1] ?? null;
  const monthAgo = localDateKey(new Date(Date.now() - 30 * DAY));
  const baseW = [...weights].reverse().find((e) => localDateKey(e.logged_at) <= monthAgo) ?? weights[0] ?? null;
  const wDelta = latestW && baseW && latestW !== baseW ? Math.round((latestW.weight_kg! - baseW.weight_kg!) * 10) / 10 : null;

  const isNew = Date.now() - new Date(client.created_at).getTime() < 14 * DAY;
  const lastSync = healthRows.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null);
  const healthOn = !!lastSync && Date.now() - new Date(lastSync).getTime() < 7 * DAY;

  // Nutrition: calories eaten (Health / YAZIO) vs. the daily target
  // Activity from the client's own onboarding answers (job type + training days they stated)
  const suggestion = suggestKcalTarget(client);
  const kcalDays = healthRows.filter((r) => r.kcal_in != null && r.kcal_in > 0);
  const avgKcal = kcalDays.length ? Math.round(kcalDays.reduce((t, r) => t + (r.kcal_in ?? 0), 0) / kcalDays.length) : null;
  const saveKcal = async (value: number | null) => {
    setKcalErr(null);
    const { error } = await supabase.from('profiles').update({ kcal_target: value }).eq('id', client.id);
    if (error) { setKcalErr(t('Speichern fehlgeschlagen (Migration kcal_target ausgeführt?)')); return; }
    setKcalTarget(value);
    setEditingKcal(false);
  };

  const addNote = async () => {
    const body = draft.trim();
    if (!body) return;
    await supabase.from('session_notes').insert({ client_id: client.id, trainer_id: client.trainer_id ?? undefined, body });
    setDraft('');
    loadNotes();
  };
  const deleteNote = async (id: string) => {
    await supabase.from('session_notes').delete().eq('id', id);
    setNotes((n) => n.filter((x) => x.id !== id));
  };

  const stats: { icon: typeof Clock; label: string; value: string }[] = [
    { icon: Dumbbell, label: t('Trainings gesamt'), value: String(completions.length) },
    { icon: Footprints, label: t('Cardio-Einheiten'), value: String(cardio.pure) },
    ...(cardio.minutesThisWeek > 0 ? [{ icon: Footprints, label: t('Cardio diese Woche'), value: `${cardio.minutesThisWeek} min` }] : []),
    { icon: Clock, label: t('Letztes Training'), value: ago(lastTraining) },
    { icon: Scale, label: t('Gewicht'), value: latestW ? `${latestW.weight_kg} kg${wDelta != null && wDelta !== 0 ? ` (${wDelta > 0 ? '+' : ''}${wDelta})` : ''}` : '—' },
    { icon: HeartPulse, label: t('Health'), value: healthOn ? `${t('verbunden')} · ${ago(lastSync)}` : t('nicht verbunden') },
  ];

  const visibleNotes = showAllNotes ? notes : notes.slice(0, 2);

  return (
    <>
      <div className="adlr-card p-5 mb-4">
        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {tags.map((tag, i) => (
            <span key={i} className="px-2.5 py-1 rounded-lg text-[11px] font-medium" style={tag.severity >= 45
              ? { background: 'rgb(var(--adlr-gold) / 0.16)', color: 'rgb(var(--adlr-gold))' }
              : { background: 'rgba(251,146,60,0.12)', color: '#fb923c' }}>
              {tagLabel(tag)}
            </span>
          ))}
          {isNew && <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/5 text-white/60">{t('Neu')} · {ago(client.created_at)}</span>}
          {client.streak > 1 && <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/5 text-white/60">{t('Streak {n} Tage', { n: client.streak })}</span>}
          {tags.length === 0 && <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>{t('Alles im grünen Bereich')}</span>}
        </div>

        {/* Weekly compliance rings */}
        <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">{t('Trainings-Compliance')}{target > 0 ? ` · ${t('Ziel {n}/Woche', { n: target })}` : ''}</p>
        {target === 0 ? (
          <p className="text-xs text-white/35 mb-4">{t('Kein aktiver Plan — kein Wochenziel.')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {weeks.map((w) => {
              const r = 26, c = 2 * Math.PI * r;
              const color = w.pct >= 100 ? '#22c55e' : w.pct >= 50 ? 'rgb(var(--adlr-gold))' : '#fb923c';
              return (
                <div key={w.label} className="flex flex-col items-center">
                  <div className="relative w-16 h-16">
                    <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
                      <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(var(--text) / 0.08)" strokeWidth="6" />
                      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - w.pct / 100)} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-sm font-bold text-white leading-none">{w.pct}%</span>
                      <span className="text-[10px] text-white/40">{w.done}/{target}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-white/45 mt-1 text-center">{w.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Nutrition: target + calories eaten (last 7 days) */}
        <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5"><Utensils size={12} /> {t('Ernährung')}</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase text-white/35">{t('Kalorienziel')}</p>
            {editingKcal ? (
              <div className="flex gap-1.5 mt-1">
                <input
                  autoFocus type="number" inputMode="numeric" value={kcalDraft}
                  onChange={(e) => setKcalDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveKcal(kcalDraft ? Math.round(Number(kcalDraft)) : null); }}
                  placeholder="kcal"
                  className="w-20 bg-inset border border-white/10 rounded-lg px-2 py-1 text-sm text-white outline-none"
                />
                <button onClick={() => saveKcal(kcalDraft ? Math.round(Number(kcalDraft)) : null)} className="adlr-tap px-2.5 rounded-lg text-xs font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>OK</button>
              </div>
            ) : kcalTarget ? (
              <button onClick={() => { setKcalDraft(String(kcalTarget)); setEditingKcal(true); }} className="adlr-tap flex items-center gap-1.5 text-sm text-white/90 font-semibold">
                {fmtKcal(kcalTarget)} <Pencil size={12} className="text-white/35" />
              </button>
            ) : (
              <div className="mt-0.5">
                {suggestion && (
                  <>
                    <button onClick={() => saveKcal(suggestion.kcal)} className="adlr-tap text-xs font-semibold text-adlr-gold block text-left">
                      {t('Vorschlag {kcal} übernehmen', { kcal: fmtKcal(suggestion.kcal) })}
                    </button>
                    <p className="text-[10px] text-white/35 leading-snug mb-0.5">{suggestion.explain}</p>
                  </>
                )}
                <button onClick={() => { setKcalDraft(suggestion ? String(suggestion.kcal) : ''); setEditingKcal(true); }} className="adlr-tap text-xs text-white/45 underline">
                  {t('selbst festlegen')}
                </button>
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase text-white/35">{t('Ø gegessen · 7 Tage')}</p>
            {avgKcal != null ? (
              <p className="text-sm text-white/90 font-semibold">
                {fmtKcal(avgKcal)}
                {kcalTarget ? <span className={`ml-1.5 text-xs font-medium ${Math.abs(avgKcal / kcalTarget - 1) <= 0.1 ? 'text-green-500' : 'text-orange-400'}`}>{Math.round((avgKcal / kcalTarget) * 100)}%</span> : null}
              </p>
            ) : (
              <p className="text-xs text-white/35 mt-0.5">{t('Keine Daten — Health/YAZIO nicht verbunden')}</p>
            )}
          </div>
        </div>
        {kcalErr && <p className="text-xs text-red-400 -mt-1 mb-3">{kcalErr}</p>}
        {kcalDays.length > 0 && kcalTarget ? (
          <div className="flex items-end gap-1.5 h-12 mb-4">
            {Array.from({ length: 7 }, (_, i) => {
              const key = localDateKey(new Date(Date.now() - (6 - i) * DAY));
              const row = healthRows.find((r) => r.day === key);
              const v = row?.kcal_in ?? 0;
              const ratio = v / kcalTarget;
              const hPct = v ? Math.min(100, Math.max(8, ratio * 70)) : 4;
              return (
                <div key={key} className="flex-1 flex flex-col items-center gap-0.5" title={v ? fmtKcal(v) : t('keine Daten')}>
                  <div className="w-full rounded-sm" style={{ height: `${hPct}%`, background: !v ? 'rgb(var(--text) / 0.08)' : Math.abs(ratio - 1) <= 0.1 ? '#22c55e' : ratio > 1 ? '#fb923c' : 'rgb(var(--adlr-gold))' }} />
                  <span className="text-[9px] text-white/35">{t(['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(`${key}T12:00:00`).getDay()])}</span>
                </div>
              );
            })}
          </div>
        ) : <div className="mb-3" />}

        {/* Key numbers */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-start gap-2 min-w-0">
              <s.icon size={14} className="text-adlr-gold/80 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase text-white/35 leading-tight">{s.label}</p>
                <p className="text-sm text-white/85 truncate">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trainer notes (private) */}
      <div className="adlr-card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-white/80 flex items-center gap-2"><StickyNote size={16} className="text-adlr-gold" /> {t('Trainer-Notizen')}</p>
          <span className="text-[11px] text-white/35">{t('nur für dich sichtbar')}</span>
        </div>
        {visibleNotes.map((n) => (
          <div key={n.id} className="group rounded-xl px-3 py-2.5 mb-2" style={{ background: 'rgb(var(--text) / 0.03)' }}>
            <p className="text-sm text-white/85 whitespace-pre-wrap">{n.body}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-white/35">{fmtDate(n.created_at, { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
              <button onClick={() => deleteNote(n.id)} aria-label={t('Notiz löschen')} className="adlr-tap p-1 text-white/30"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
        {notes.length > 2 && (
          <button onClick={() => setShowAllNotes(!showAllNotes)} className="adlr-tap w-full mb-2 text-xs font-medium text-adlr-gold">
            {showAllNotes ? t('Weniger anzeigen') : t('Alle {n} Notizen anzeigen', { n: notes.length })}
          </button>
        )}
        <div className="flex gap-2">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('Neue Notiz, z. B. „Knie links schonen“…')}
            className="flex-1 bg-inset border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none resize-none"
          />
          <button onClick={addNote} disabled={!draft.trim()} className="adlr-tap px-3.5 rounded-xl text-sm font-semibold disabled:opacity-40" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
            +
          </button>
        </div>
      </div>
    </>
  );
}
