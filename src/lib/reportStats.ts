import type { WorkoutCompletion, ExerciseSetLog } from '@/lib/types';

export type ReportMetric = 'workouts' | 'duration' | 'volume' | 'sets';

export interface MonthStats {
  year: number;
  month: number; // 0-11
  workouts: number;
  sets: number;
  volumeKg: number;
  durationMin: number;
  byMuscle: Record<string, number>; // sets per muscle group
  topExercises: { name: string; exerciseId?: string; count: number }[]; // count = sessions incl. exercise
}

// Canonical radar axes (minor groups fold into these).
export const RADAR_AXES = ['Rücken', 'Brust', 'Core', 'Schultern', 'Arme', 'Beine'] as const;
const FOLD: Record<string, string> = {
  Po: 'Beine',
  Unterarme: 'Arme',
  Nacken: 'Rücken',
};
export function radarGroup(muscle: string): string | null {
  const g = FOLD[muscle] ?? muscle;
  return (RADAR_AXES as readonly string[]).includes(g) ? g : null;
}

const ym = (iso: string) => { const d = new Date(iso); return d.getFullYear() * 12 + d.getMonth(); };

export function computeMonth(
  setLogs: ExerciseSetLog[],
  completions: WorkoutCompletion[],
  muscleOf: (name: string) => string,
  year: number,
  month: number,
): MonthStats {
  const target = year * 12 + month;
  const logs = setLogs.filter((l) => ym(l.created_at) === target);
  const comps = completions.filter((c) => ym(c.completed_at) === target);

  const byMuscle: Record<string, number> = {};
  let volumeKg = 0;
  for (const l of logs) {
    const m = muscleOf(l.exercise_name) || 'Sonstige';
    byMuscle[m] = (byMuscle[m] ?? 0) + 1;
    if (l.weight_kg != null && l.reps != null) volumeKg += l.weight_kg * l.reps;
  }

  // Top exercises by number of distinct sessions that included them.
  const sessionsByEx = new Map<string, Set<string>>();
  const idByEx = new Map<string, string | undefined>();
  for (const l of logs) {
    const set = sessionsByEx.get(l.exercise_name) ?? new Set<string>();
    set.add(l.workout_completion_id ?? l.id);
    sessionsByEx.set(l.exercise_name, set);
  }
  const topExercises = [...sessionsByEx.entries()]
    .map(([name, s]) => ({ name, exerciseId: idByEx.get(name), count: s.size }))
    .sort((a, b) => b.count - a.count);

  const durationMin = Math.round(comps.reduce((sum, c) => sum + (c.duration_sec ?? 0), 0) / 60);

  return { year, month, workouts: comps.length, sets: logs.length, volumeKg: Math.round(volumeKg), durationMin, byMuscle, topExercises };
}

export function metricValue(s: MonthStats, m: ReportMetric): number {
  switch (m) {
    case 'workouts': return s.workouts;
    case 'duration': return s.durationMin;
    case 'volume': return s.volumeKg;
    case 'sets': return s.sets;
  }
}

/** Trailing `count` months up to and including (year, month), oldest first. */
export function trailingMonths(
  setLogs: ExerciseSetLog[],
  completions: WorkoutCompletion[],
  muscleOf: (name: string) => string,
  year: number,
  month: number,
  count: number,
): MonthStats[] {
  const out: MonthStats[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const idx = year * 12 + month - i;
    out.push(computeMonth(setLogs, completions, muscleOf, Math.floor(idx / 12), ((idx % 12) + 12) % 12));
  }
  return out;
}

export function fmtVolume(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 10000 ? 0 : 1)}k kg` : `${kg} kg`;
}
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}
export function fmtDelta(metric: ReportMetric, cur: number, prev: number): string {
  const d = cur - prev;
  const sign = d >= 0 ? '↑' : '↓';
  const abs = Math.abs(d);
  if (metric === 'volume') return `${sign} ${fmtVolume(abs)}`;
  if (metric === 'duration') return `${sign} ${fmtDuration(abs)}`;
  return `${sign} ${abs}`;
}

export const MONTH_NAMES_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
