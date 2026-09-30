import type { WorkoutCompletion, ExerciseSetLog } from '@/lib/types';
import { RADAR_AXES, radarGroup } from '@/lib/reportStats';
import { localDateKey } from '@/lib/dates';
import { t, fmtNum } from '@/lib/i18n';

export interface SessionExercise {
  name: string;
  sets: number;
  best: { weight_kg: number; reps: number } | null; // heaviest non-warm-up set
  cardio: { minutes: number; km: number } | null;   // summed time/distance (cardio sets)
  logs: ExerciseSetLog[];
}

export interface SessionSummary {
  completion: WorkoutCompletion;
  name: string;
  durationMin: number | null;
  volumeKg: number;
  sets: number;
  exercises: SessionExercise[]; // in logged order
  radar: { axis: string; sets: number }[]; // sets per canonical muscle axis
}

export function summarizeSession(
  completion: WorkoutCompletion,
  logs: ExerciseSetLog[],
  name: string,
  muscleOf: (exercise: string) => string,
): SessionSummary {
  const byEx = new Map<string, ExerciseSetLog[]>();
  let volumeKg = 0;
  const radarSets: Record<string, number> = {};
  for (const l of logs) {
    const arr = byEx.get(l.exercise_name) ?? [];
    arr.push(l);
    byEx.set(l.exercise_name, arr);
    if (l.weight_kg != null && l.reps != null) volumeKg += l.weight_kg * l.reps; // same rule as the Monatsbericht
    const axis = radarGroup(muscleOf(l.exercise_name));
    if (axis) radarSets[axis] = (radarSets[axis] ?? 0) + 1;
  }
  const exercises: SessionExercise[] = [...byEx.entries()].map(([exName, ls]) => {
    ls.sort((a, b) => a.set_number - b.set_number);
    let best: SessionExercise['best'] = null;
    for (const l of ls) {
      if (l.weight_kg == null || l.set_type === 'warmup') continue;
      if (!best || l.weight_kg > best.weight_kg) best = { weight_kg: l.weight_kg, reps: l.reps ?? 0 };
    }
    const sec = ls.reduce((t, l) => t + (l.duration_sec ?? 0), 0);
    const km = ls.reduce((t, l) => t + (l.distance_km ?? 0), 0);
    const cardio = sec > 0 || km > 0 ? { minutes: Math.round(sec / 60), km: Math.round(km * 100) / 100 } : null;
    return { name: exName, sets: ls.length, best, cardio, logs: ls };
  });
  return {
    completion,
    name,
    durationMin: completion.duration_sec ? Math.round(completion.duration_sec / 60) : null,
    volumeKg: Math.round(volumeKg),
    sets: logs.length,
    exercises,
    radar: RADAR_AXES.map((axis) => ({ axis, sets: radarSets[axis] ?? 0 })),
  };
}

/** Set logs grouped by the workout completion they belong to. */
export function logsByCompletion(logs: ExerciseSetLog[]): Map<string, ExerciseSetLog[]> {
  const m = new Map<string, ExerciseSetLog[]>();
  for (const l of logs) {
    if (!l.workout_completion_id) continue;
    const arr = m.get(l.workout_completion_id) ?? [];
    arr.push(l);
    m.set(l.workout_completion_id, arr);
  }
  return m;
}

/** 1-based position of this completion in the client's whole history. */
export function workoutNumber(completion: WorkoutCompletion, all: WorkoutCompletion[]): number {
  return all.filter((c) => c.completed_at <= completion.completed_at).length;
}

/** Date keys (YYYY-MM-DD) with at least one completed training. */
export function trainedDateKeys(all: WorkoutCompletion[]): Set<string> {
  return new Set(all.map((c) => localDateKey(c.completed_at)));
}

// Fun comparison for the lifted volume: the heaviest object the volume covers at
// least once, with a multiplier ("so viel wie 2 Autos"). Weights are realistic
// reference values (rounded), so the claim is always true.
export type ComparisonIcon = 'truck' | 'tram' | 'ship' | 'bus' | 'tractor' | 'forklift' | 'caravan' | 'car' | 'piano' | 'fridge';
const COMPARISONS: { kg: number; icon: ComparisonIcon; one: string; many: string }[] = [
  { kg: 40000, icon: 'truck', one: 'ein voll beladener Sattelschlepper', many: 'voll beladene Sattelschlepper' }, // 40 t zul. Gesamtgewicht
  { kg: 30000, icon: 'tram', one: 'eine Straßenbahn', many: 'Straßenbahnen' },                                      // Niederflur-Tram ~30–40 t
  { kg: 18000, icon: 'ship', one: 'eine Motoryacht', many: 'Motoryachten' },                                          // ~18 m Yacht
  { kg: 12000, icon: 'bus', one: 'ein Linienbus', many: 'Linienbusse' },                                              // Solobus leer ~11–13 t
  { kg: 7000, icon: 'tractor', one: 'ein großer Traktor', many: 'große Traktoren' },                                   // ~7 t
  { kg: 4000, icon: 'forklift', one: 'ein Gabelstapler', many: 'Gabelstapler' },                                      // 2,5-t-Stapler ~4 t Eigengewicht
  { kg: 2500, icon: 'caravan', one: 'ein großer Wohnwagen', many: 'große Wohnwagen' },                                // ~2,5 t
  { kg: 1500, icon: 'car', one: 'ein Auto', many: 'Autos' },                                                          // Kompaktwagen ~1,3–1,5 t
  { kg: 480, icon: 'piano', one: 'ein Konzertflügel', many: 'Konzertflügel' },                                        // Steinway D ~480 kg
  { kg: 90, icon: 'fridge', one: 'ein Kühlschrank', many: 'Kühlschränke' },                                           // Kühl-Gefrierkombi ~70–90 kg
];
export function volumeComparison(kg: number): { icon: ComparisonIcon; count: number; text: string } | null {
  const c = COMPARISONS.find((x) => kg >= x.kg);
  if (!c) return null;
  const count = Math.floor(kg / c.kg);
  return { icon: c.icon, count, text: count >= 2 ? t('Das ist so viel wie {n} {what}!', { n: count, what: t(c.many) }) : t('Das ist so viel wie {what}!', { what: t(c.one) }) };
}

export function fmtKg(kg: number): string {
  return `${fmtNum(kg)} kg`;
}
