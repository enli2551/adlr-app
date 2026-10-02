import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Clock, Dumbbell, Weight, History } from 'lucide-react';
import type { WorkoutCompletion, ExerciseSetLog } from '@/lib/types';
import { summarizeSession, logsByCompletion, fmtKg, type SessionSummary } from '@/lib/workoutSummary';
import { fmtDuration, monthName } from '@/lib/reportStats';
import WorkoutSummary from '@/components/WorkoutSummary';
import { t, fmtDate } from '@/lib/i18n';

interface Props {
  completions: WorkoutCompletion[];
  setLogs: ExerciseSetLog[];
  dayNameById: Map<string, string>;
  muscleOf: (exercise: string) => string;
  limit?: number; // show only the newest N (with a "show all" toggle)
  collapsible?: boolean; // render its own header and start collapsed (trainer ClientDetail)
  onRepeat?: (s: SessionSummary) => void; // client: "Nochmal trainieren"
}

// Chronological, month-grouped list of every completed training. Tapping a row opens
// the same swipeable recap the client sees right after finishing a workout.
export default function TrainingHistory({ completions, setLogs, dayNameById, muscleOf, limit, collapsible = false, onRepeat }: Props) {
  const [cardOpen, setCardOpen] = useState(!collapsible);
  const [closedMonths, setClosedMonths] = useState<Set<string> | null>(null); // null = only newest month open
  const [open, setOpen] = useState<SessionSummary | null>(null);
  const [showAll, setShowAll] = useState(false);

  const summaries = useMemo(() => {
    const byComp = logsByCompletion(setLogs);
    return [...completions]
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
      .map((c) => summarizeSession(c, byComp.get(c.id) ?? [], (c.plan_day_id && dayNameById.get(c.plan_day_id)) || c.title || 'Training', muscleOf));
  }, [completions, setLogs, dayNameById, muscleOf]);

  const visible = limit && !showAll ? summaries.slice(0, limit) : summaries;
  const groups = useMemo(() => {
    const out: { key: string; label: string; count: number; items: SessionSummary[] }[] = [];
    for (const s of visible) {
      const d = new Date(s.completion.completed_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = out.find((x) => x.key === key);
      if (!g) {
        const count = summaries.filter((x) => { const e = new Date(x.completion.completed_at); return e.getFullYear() === d.getFullYear() && e.getMonth() === d.getMonth(); }).length;
        g = { key, label: `${monthName(d.getMonth())} ${d.getFullYear()}`, count, items: [] };
        out.push(g);
      }
      g.items.push(s);
    }
    return out;
  }, [visible, summaries]);

  const isMonthOpen = (key: string, idx: number) => (closedMonths === null ? idx === 0 : !closedMonths.has(key));
  const toggleMonth = (key: string, idx: number) => {
    const current = closedMonths ?? new Set(groups.filter((_, i) => i !== 0).map((g) => g.key));
    const next = new Set(current);
    if (isMonthOpen(key, idx)) next.add(key); else next.delete(key);
    setClosedMonths(next);
  };

  const last = summaries[0];
  const daysAgo = last ? Math.floor((Date.now() - new Date(last.completion.completed_at).getTime()) / 86400000) : null;
  const header = collapsible && (
    <button onClick={() => setCardOpen(!cardOpen)} className="adlr-tap w-full flex items-center justify-between text-left">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white/80 flex items-center gap-2"><History size={16} className="text-adlr-gold" /> {t('Trainings-Historie')}</p>
        <p className="text-xs text-white/40 mt-0.5">
          {summaries.length === 0 ? t('Noch keine Trainings') : `${t('{n} Trainings', { n: summaries.length })} · ${t('letztes')} ${daysAgo === 0 ? t('heute') : daysAgo === 1 ? t('gestern') : t('vor {n} Tagen', { n: daysAgo ?? 0 })}`}
        </p>
      </div>
      <ChevronDown size={17} className="shrink-0 text-white/35 transition-transform" style={{ transform: cardOpen ? 'rotate(180deg)' : 'none' }} />
    </button>
  );

  if (summaries.length === 0) {
    return collapsible ? <>{header}</> : <p className="text-sm text-white/30">{t('Noch keine abgeschlossenen Trainings.')}</p>;
  }
  if (!cardOpen) return <>{header}</>;

  return (
    <>
      {header}
      <div className={`space-y-3 ${collapsible ? 'mt-3 adlr-fade-in' : ''}`}>
        {groups.map((g, gi) => (
          <div key={g.key}>
            <button onClick={() => toggleMonth(g.key, gi)} className="adlr-tap w-full flex items-center justify-between py-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                <ChevronDown size={13} className="transition-transform" style={{ transform: isMonthOpen(g.key, gi) ? 'none' : 'rotate(-90deg)' }} />
                {g.label}
              </p>
              <p className="text-xs text-white/35">{t(g.count === 1 ? '{n} Training' : '{n} Trainings', { n: g.count })}</p>
            </button>
            {isMonthOpen(g.key, gi) && <div className="space-y-2 mt-1.5">
              {g.items.map((s) => {
                const d = new Date(s.completion.completed_at);
                const top = s.exercises.slice(0, 3);
                return (
                  <button
                    key={s.completion.id}
                    onClick={() => setOpen(s)}
                    className="adlr-tap w-full text-left rounded-2xl px-4 py-3 flex items-center gap-3"
                    style={{ background: 'rgb(var(--text) / 0.03)', border: '1px solid rgb(var(--text) / 0.08)' }}
                  >
                    <div className="w-11 shrink-0 text-center">
                      <p className="text-[10px] uppercase text-white/40">{fmtDate(d, { weekday: 'short' })}</p>
                      <p className="text-lg font-bold text-white leading-tight">{d.getDate()}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{t(s.name)}{s.completion.gym ? <span className="text-white/40 font-normal"> · {s.completion.gym}</span> : null}</p>
                      <p className="text-xs text-white/45 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        {s.durationMin != null && <span className="flex items-center gap-1"><Clock size={11} /> {fmtDuration(s.durationMin)}</span>}
                        {s.volumeKg > 0 && <span className="flex items-center gap-1"><Weight size={11} /> {fmtKg(s.volumeKg)}</span>}
                        <span className="flex items-center gap-1"><Dumbbell size={11} /> {t('{n} Sätze', { n: s.sets })}</span>
                      </p>
                      {top.length > 0 && (
                        <p className="text-xs text-white/35 mt-1 truncate">
                          {top.map((e) => `${e.sets}× ${t(e.name)}`).join(' · ')}{s.exercises.length > 3 ? ` · +${s.exercises.length - 3}` : ''}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-white/25" />
                  </button>
                );
              })}
            </div>}
          </div>
        ))}
      </div>
      {limit && summaries.length > limit && (
        <button onClick={() => setShowAll(!showAll)} className="adlr-tap w-full mt-3 py-2.5 rounded-xl text-xs font-medium text-adlr-gold bg-white/5">
          {showAll ? t('Weniger anzeigen') : t('Alle {n} Trainings anzeigen', { n: summaries.length })}
        </button>
      )}
      {open && <WorkoutSummary summary={open} allCompletions={completions} mode="history" onClose={() => setOpen(null)} onRepeat={onRepeat ? () => { onRepeat(open); setOpen(null); } : undefined} />}
    </>
  );
}
