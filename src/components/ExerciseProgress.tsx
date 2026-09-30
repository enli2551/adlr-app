import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import type { ExerciseSetLog, WorkoutCompletion } from '@/lib/types';
import { t, fmtDate } from '@/lib/i18n';

interface Props {
  setLogs: ExerciseSetLog[];
  completions?: WorkoutCompletion[]; // for the Studio (gym) of each session
}

type Metric = 'top' | 'e1rm' | 'volume';
const METRICS: { id: Metric; label: string }[] = [
  { id: 'top', label: 'Top-Satz' },
  { id: 'e1rm', label: 'Geschätztes 1RM' },
  { id: 'volume', label: 'Volumen' },
];

// Epley estimate; only meaningful up to ~12 reps, beyond that we just use the weight.
const e1rm = (w: number, r: number) => (r <= 1 ? w : r > 12 ? w : w * (1 + r / 30));

interface Point { key: string; date: string; label: string; top: number; e1rm: number; volume: number; gym: string | null }

/** Strength curve per exercise: one point per session (best working set). */
export default function ExerciseProgress({ setLogs, completions = [] }: Props) {
  const gymByCompletion = useMemo(() => new Map(completions.map((c) => [c.id, c.gym ?? null])), [completions]);

  // Exercises with weighted data, most-trained first.
  const exercises = useMemo(() => {
    const sessions = new Map<string, Set<string>>();
    for (const l of setLogs) {
      if (l.weight_kg == null || l.weight_kg <= 0) continue;
      const s = sessions.get(l.exercise_name) ?? new Set<string>();
      s.add(l.workout_completion_id ?? l.created_at.slice(0, 10));
      sessions.set(l.exercise_name, s);
    }
    return [...sessions.entries()].map(([name, s]) => ({ name, sessions: s.size })).sort((a, b) => b.sessions - a.sessions);
  }, [setLogs]);

  const [exercise, setExercise] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('top');
  const [gym, setGym] = useState<string | 'all'>('all');
  const current = exercise ?? exercises[0]?.name ?? null;

  const allPoints = useMemo<Point[]>(() => {
    if (!current) return [];
    const bySession = new Map<string, ExerciseSetLog[]>();
    for (const l of setLogs) {
      if (l.exercise_name !== current || l.weight_kg == null || l.set_type === 'warmup') continue;
      const k = l.workout_completion_id ?? l.created_at.slice(0, 10);
      const arr = bySession.get(k) ?? [];
      arr.push(l);
      bySession.set(k, arr);
    }
    return [...bySession.entries()]
      .map(([key, ls]) => {
        const best = ls.reduce((m, l) => ((l.weight_kg ?? 0) > (m.weight_kg ?? 0) ? l : m), ls[0]);
        const d = new Date(ls[0].created_at);
        return {
          key,
          date: ls[0].created_at,
          label: fmtDate(d, { day: '2-digit', month: '2-digit' }),
          top: best.weight_kg ?? 0,
          e1rm: Math.round(Math.max(...ls.map((l) => e1rm(l.weight_kg ?? 0, l.reps ?? 0))) * 10) / 10,
          volume: Math.round(ls.reduce((s, l) => s + (l.weight_kg ?? 0) * (l.reps ?? 0), 0)),
          gym: (ls[0].workout_completion_id && gymByCompletion.get(ls[0].workout_completion_id)) || null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [current, setLogs, gymByCompletion]);

  const gyms = useMemo(() => [...new Set(allPoints.map((p) => p.gym).filter((g): g is string => !!g))], [allPoints]);
  const points = gym === 'all' ? allPoints : allPoints.filter((p) => p.gym === gym);

  if (exercises.length === 0) {
    return <p className="text-sm text-white/30">{t('Noch keine Trainingsdaten. Starte ein Training und trage deine Gewichte ein.')}</p>;
  }

  const first = points[0]?.[metric] ?? 0;
  const last = points[points.length - 1]?.[metric] ?? 0;
  const best = points.reduce((m, p) => Math.max(m, p[metric]), 0);
  const diff = last - first;
  const unit = 'kg';

  const chip = (active: boolean) => (active
    ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))' }
    : { background: 'transparent', color: 'rgb(var(--text) / 0.55)', borderColor: 'rgb(var(--text) / 0.12)' });

  return (
    <div>
      <select
        value={current ?? ''}
        onChange={(e) => { setExercise(e.target.value); setGym('all'); }}
        className="w-full bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm mb-2.5 outline-none"
      >
        {exercises.map((e) => <option key={e.name} value={e.name}>{t(e.name)} ({e.sessions}×)</option>)}
      </select>

      <div className="flex gap-1.5 mb-2.5 overflow-x-auto">
        {METRICS.map((m) => (
          <button key={m.id} onClick={() => setMetric(m.id)} className="adlr-tap px-2.5 py-1 rounded-lg text-xs font-medium border whitespace-nowrap" style={chip(metric === m.id)}>{t(m.label)}</button>
        ))}
      </div>
      {gyms.length > 1 && (
        <div className="flex gap-1.5 mb-2.5 overflow-x-auto">
          {(['all', ...gyms] as const).map((g) => (
            <button key={g} onClick={() => setGym(g)} className="adlr-tap px-2.5 py-1 rounded-lg text-xs font-medium border whitespace-nowrap" style={chip(gym === g)}>{g === 'all' ? t('Alle Studios') : g}</button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="rounded-xl py-2" style={{ background: 'rgb(var(--text) / 0.04)' }}>
          <p className="text-base font-bold text-white">{last} {unit}</p>
          <p className="text-[10px] text-white/40 uppercase">{t('Aktuell')}</p>
        </div>
        <div className="rounded-xl py-2" style={{ background: 'rgb(var(--text) / 0.04)' }}>
          <p className="text-base font-bold text-adlr-gold">{best} {unit}</p>
          <p className="text-[10px] text-white/40 uppercase">{t('Bestwert')}</p>
        </div>
        <div className="rounded-xl py-2" style={{ background: 'rgb(var(--text) / 0.04)' }}>
          <p className={`text-base font-bold ${diff > 0 ? 'text-green-500' : diff < 0 ? 'text-red-400' : 'text-white'}`}>{diff > 0 ? '+' : ''}{Math.round(diff * 10) / 10} {unit}</p>
          <p className="text-[10px] text-white/40 uppercase">{t('Seit Start')}</p>
        </div>
      </div>

      {points.length >= 2 ? (
        <div className="h-44 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgb(var(--text) / 0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgb(var(--text) / 0.4)', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis tick={{ fill: 'rgb(var(--text) / 0.4)', fontSize: 10 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} width={44} />
              <Tooltip
                contentStyle={{ background: 'rgb(var(--adlr-anthracite))', border: '1px solid rgb(var(--text) / 0.1)', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: 'rgb(var(--text) / 0.6)' }}
                formatter={((v: number, _n: string, item: { payload?: Point }) => [
                  `${v} kg${item?.payload?.gym ? ` · ${item.payload.gym}` : ''}`,
                  t(METRICS.find((m) => m.id === metric)?.label ?? ''),
                ]) as never}
              />
              <Line type="monotone" dataKey={metric} stroke="rgb(var(--adlr-gold))" strokeWidth={2.5} dot={{ r: 3, fill: 'rgb(var(--adlr-gold))' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-white/35 text-center py-6">{t('Ab zwei Trainings mit dieser Übung erscheint hier die Kurve.')}</p>
      )}
    </div>
  );
}
