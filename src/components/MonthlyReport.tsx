import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth';
import { useAsyncData } from '@/lib/useAsyncData';
import { supabase } from '@/lib/supabase';
import { fetchExercises } from '@/lib/exercises';
import type { WorkoutCompletion, ExerciseSetLog } from '@/lib/types';
import { LOCAL_DEMO_IMAGES } from '@/components/ExerciseLibrary';
import { Loading } from '@/components/ui';
import { ArrowLeft, Share2, Dumbbell, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import {
  computeMonth, trailingMonths, metricValue, radarGroup, RADAR_AXES,
  fmtVolume, fmtDuration, fmtDelta, MONTH_NAMES_DE, type ReportMetric, type MonthStats,
} from '@/lib/reportStats';

const METRICS: { id: ReportMetric; label: string }[] = [
  { id: 'workouts', label: 'Workouts' },
  { id: 'duration', label: 'Dauer' },
  { id: 'volume', label: 'Volumen' },
  { id: 'sets', label: 'Sätze' },
];
const GOLD = 'rgb(var(--adlr-gold))';
const MUTED = 'rgb(var(--text) / 0.12)';

export default function MonthlyReport({ onClose, clientId, clientName }: { onClose: () => void; clientId?: string; clientName?: string }) {
  const { profile } = useAuth();
  const targetId = clientId ?? profile?.id;
  const greetName = clientName ?? profile?.first_name ?? '';
  const [metric, setMetric] = useState<ReportMetric>('workouts');

  const loader = useMemo(() => async () => {
    if (!targetId) return { comps: [] as WorkoutCompletion[], logs: [] as ExerciseSetLog[], muscleOf: (_: string) => 'Sonstige', idOf: (_: string) => undefined as string | undefined };
    const [wc, sl, lib] = await Promise.all([
      supabase.from('workout_completions').select('*').eq('client_id', targetId),
      supabase.from('exercise_set_logs').select('*').eq('client_id', targetId),
      fetchExercises(),
    ]);
    const byName = new Map((lib ?? []).map((e) => [e.name, e]));
    const muscleOf = (name: string) => byName.get(name)?.muscle_group ?? 'Sonstige';
    const idOf = (name: string) => byName.get(name)?.exercise_id;
    return { comps: (wc.data ?? []) as WorkoutCompletion[], logs: (sl.data ?? []) as ExerciseSetLog[], muscleOf, idOf };
  }, [targetId]);

  const { data, loading } = useAsyncData(loader, [targetId]);

  // Default to the most recent month that has workouts (so the report is never empty).
  const { y, m } = useMemo(() => {
    if (data && data.comps.length) {
      const maxYm = Math.max(...data.comps.map((c) => { const d = new Date(c.completed_at); return d.getFullYear() * 12 + d.getMonth(); }));
      return { y: Math.floor(maxYm / 12), m: ((maxYm % 12) + 12) % 12 };
    }
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  }, [data]);

  const cur = useMemo(() => data ? computeMonth(data.logs, data.comps, data.muscleOf, y, m) : null, [data, y, m]);
  const prevIdx = y * 12 + m - 1;
  const prev = useMemo(() => data ? computeMonth(data.logs, data.comps, data.muscleOf, Math.floor(prevIdx / 12), ((prevIdx % 12) + 12) % 12) : null, [data, prevIdx]);
  const trend = useMemo(() => data ? trailingMonths(data.logs, data.comps, data.muscleOf, y, m, 9) : [], [data, y, m]);

  const body = (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'rgb(var(--adlr-black))' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 safe-top" style={{ background: 'rgb(var(--adlr-black) / 0.9)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgb(var(--text) / 0.06)' }}>
        <button onClick={onClose} className="adlr-tap w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgb(var(--text) / 0.06)' }}>
          <ArrowLeft size={18} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">{MONTH_NAMES_DE[m]} Bericht</h1>
      </div>

      {loading || !cur || !prev ? (
        <Loading />
      ) : (
        <div className="px-4 pb-28 pt-2 adlr-fade-in max-w-md mx-auto w-full">
          {/* Header: month + workouts + delta */}
          <p className="text-3xl font-extrabold text-white mt-2">{MONTH_NAMES_DE[m]} {y}</p>
          <div className="flex items-center gap-2 mt-1 mb-4">
            <span className="text-2xl font-bold text-white">{cur.workouts}</span>
            <Delta metric="workouts" cur={cur.workouts} prev={prev.workouts} />
            <span className="text-sm text-white/40">Workouts</span>
          </div>

          {/* Trend chart + metric tabs */}
          <div className="adlr-card p-4 mb-5">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trend.map((s) => ({ label: MONTH_NAMES_DE[s.month][0], value: metricValue(s, metric), isCur: s.year === y && s.month === m }))} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="label" stroke="rgb(var(--text) / 0.3)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis hide domain={[0, (max: number) => Math.max(max, 1)]} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                  {trend.map((s, i) => (
                    <Cell key={i} fill={s.year === y && s.month === m ? GOLD : MUTED} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
              {METRICS.map((mt) => {
                const on = metric === mt.id;
                return (
                  <button key={mt.id} onClick={() => setMetric(mt.id)}
                    className="adlr-tap px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                    style={on ? { background: GOLD, color: '#000' } : { background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.6)' }}>
                    {mt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Zusammenfassung */}
          <p className="text-xs uppercase tracking-wider text-white/30 mb-3">Zusammenfassung</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <StatCard label="Workouts" value={String(cur.workouts)} metric="workouts" cur={cur.workouts} prev={prev.workouts} />
            <StatCard label="Dauer" value={fmtDuration(cur.durationMin)} metric="duration" cur={cur.durationMin} prev={prev.durationMin} />
            <StatCard label="Volumen" value={fmtVolume(cur.volumeKg)} metric="volume" cur={cur.volumeKg} prev={prev.volumeKg} />
            <StatCard label="Sätze" value={String(cur.sets)} metric="sets" cur={cur.sets} prev={prev.sets} />
          </div>

          {/* Muskelverteilung radar */}
          {cur.sets > 0 && (
            <>
              <p className="text-xs uppercase tracking-wider text-white/30 mb-2">Muskelverteilung</p>
              <div className="adlr-card p-4 mb-6">
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData(cur, prev)} outerRadius="70%">
                    <PolarGrid stroke="rgb(var(--text) / 0.12)" />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: 'rgb(var(--text) / 0.55)', fontSize: 12 }} />
                    <Radar name="Vormonat" dataKey="prev" stroke="rgb(var(--text) / 0.3)" fill="rgb(var(--text) / 0.15)" fillOpacity={0.6} isAnimationActive={false} />
                    <Radar name="Aktuell" dataKey="cur" stroke={GOLD} fill={GOLD} fillOpacity={0.4} isAnimationActive={false} />
                  </RadarChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-white/40"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgb(var(--text) / 0.3)' }} /> {MONTH_NAMES_DE[prev.month]}</span>
                  <span className="flex items-center gap-1.5 text-white/70"><span className="w-2.5 h-2.5 rounded-full" style={{ background: GOLD }} /> {MONTH_NAMES_DE[m]}</span>
                </div>
              </div>
            </>
          )}

          {/* Hauptmuskelgruppen */}
          {cur.sets > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wider text-white/30">Hauptmuskelgruppen</p>
                <span className="text-xs uppercase tracking-wider text-white/30">Sätze</span>
              </div>
              {(() => {
                const rows = Object.entries(cur.byMuscle).sort((a, b) => b[1] - a[1]);
                const max = rows[0]?.[1] ?? 1;
                return rows.map(([muscle, sets]) => (
                  <div key={muscle} className="flex items-center gap-3 mb-2.5">
                    <span className="text-sm text-white/80 w-24 shrink-0">{muscle}</span>
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgb(var(--text) / 0.06)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(sets / max) * 100}%`, background: GOLD }} />
                    </div>
                    <span className="text-sm font-semibold text-white w-8 text-right">{sets}</span>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* Top-Übungen */}
          {cur.topExercises.length > 0 && (
            <div className="mb-6">
              <p className="text-xs uppercase tracking-wider text-white/30 mb-3">Top-Übungen</p>
              <div className="adlr-card divide-y" style={{ borderColor: 'rgb(var(--text) / 0.05)' }}>
                {cur.topExercises.slice(0, 5).map((ex) => {
                  const img = data ? LOCAL_DEMO_IMAGES[data.idOf(ex.name) ?? ''] : undefined;
                  return (
                    <div key={ex.name} className="flex items-center gap-3 px-3 py-3">
                      <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center" style={{ background: '#fff' }}>
                        {img ? <img src={`/exercises/${img}`} alt="" className="w-full h-full object-contain" /> : <Dumbbell size={18} style={{ color: 'rgb(var(--adlr-gold-dim))' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white leading-tight">{ex.name}</p>
                        <p className="text-xs text-white/40 mt-0.5">{ex.count} mal</p>
                      </div>
                      <ChevronRight size={16} className="text-white/20 shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Congrats */}
          <h2 className="text-xl font-bold text-white mb-2">Glückwunsch zu einem tollen Monat, {profile?.first_name ?? ''}! 👏</h2>
          <p className="text-sm text-white/50 mb-4">Feiere deine Erfolge und bleib dran.</p>
        </div>
      )}

      {/* Share bar */}
      {!loading && cur && (
        <div className="fixed bottom-0 left-0 right-0 px-4 py-3 safe-bottom" style={{ background: 'rgb(var(--adlr-black) / 0.95)', backdropFilter: 'blur(8px)', borderTop: '1px solid rgb(var(--text) / 0.06)' }}>
          <div className="max-w-md mx-auto">
            <button onClick={() => shareReport(cur, m, y)} className="adlr-tap w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: GOLD, color: '#000' }}>
              <Share2 size={17} /> Teilen
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(body, document.body);
}

function radarData(cur: MonthStats, prev: MonthStats) {
  const foldSum = (by: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const ax of RADAR_AXES) out[ax] = 0;
    for (const [muscle, n] of Object.entries(by)) {
      const g = radarGroup(muscle);
      if (g) out[g] += n;
    }
    return out;
  };
  const c = foldSum(cur.byMuscle);
  const p = foldSum(prev.byMuscle);
  return RADAR_AXES.map((axis) => ({ axis, cur: c[axis], prev: p[axis] }));
}

function Delta({ metric, cur, prev }: { metric: ReportMetric; cur: number; prev: number }) {
  if (prev === 0 && cur === 0) return null;
  const up = cur >= prev;
  return (
    <span className="flex items-center gap-0.5 text-sm font-semibold" style={{ color: up ? '#22c55e' : '#f87171' }}>
      {up ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
      {fmtDelta(metric, cur, prev).replace(/^[↑↓]\s*/, '')}
    </span>
  );
}

function StatCard({ label, value, metric, cur, prev }: { label: string; value: string; metric: ReportMetric; cur: number; prev: number }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.07)' }}>
      <p className="text-sm text-white/50">{label}</p>
      <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
      <div className="mt-1"><Delta metric={metric} cur={cur} prev={prev} /></div>
    </div>
  );
}

async function shareReport(cur: MonthStats, month: number, year: number): Promise<void> {
  const text = `Mein ${MONTH_NAMES_DE[month]} ${year} bei ADLR 💪\n${cur.workouts} Workouts · ${cur.sets} Sätze · ${fmtVolume(cur.volumeKg)} · ${fmtDuration(cur.durationMin)}\nSteig auf. Bleib stark. 🦅`;
  try {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    if (nav.share) { await nav.share({ title: 'ADLR Monatsbericht', text }); return; }
    await navigator.clipboard?.writeText(text);
  } catch { /* user cancelled or unsupported */ }
}
