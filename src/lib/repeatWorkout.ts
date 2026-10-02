import type { ExerciseSetLog } from '@/lib/types';

// "Nochmal trainieren": a past session is handed to the training screen (via
// sessionStorage, so it survives the route change) and started as a free workout,
// prefilled with the same exercises, sets, weights and reps.

const KEY = 'adlr_repeat_workout';

export interface RepeatSet { weight: string; reps: string; min: string; km: string; type: 'warmup' | 'working' | 'dropset' }
export interface RepeatWorkout { title: string; exercises: { name: string; sets: RepeatSet[] }[] }

export function requestRepeat(title: string, exercises: { name: string; logs: ExerciseSetLog[] }[]): void {
  const payload: RepeatWorkout = {
    title,
    exercises: exercises.map((e) => ({
      name: e.name,
      sets: [...e.logs].sort((a, b) => a.set_number - b.set_number).map((l) => ({
        weight: l.weight_kg != null ? String(l.weight_kg) : '',
        reps: l.reps != null ? String(l.reps) : '',
        min: l.duration_sec ? String(Math.round(l.duration_sec / 60)) : '',
        km: l.distance_km != null ? String(l.distance_km) : '',
        type: (l.set_type as RepeatSet['type']) ?? 'working',
      })),
    })).filter((e) => e.sets.length > 0),
  };
  try { sessionStorage.setItem(KEY, JSON.stringify(payload)); } catch { /* ignore */ }
}

/** Returns and clears a pending repeat request. */
export function takeRepeat(): RepeatWorkout | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as RepeatWorkout;
  } catch { return null; }
}
