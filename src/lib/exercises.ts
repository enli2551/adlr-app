import { supabase } from '@/lib/supabase';

export interface ExerciseRow {
  id: number;
  name: string;
  muscle_group: string;
  equipment: string;
  tempo: string;
  default_sets: number;
  default_reps: number;
  default_rest_sec: number;
  exercise_id: string;
  cues: string[];
}

export const MUSCLE_GROUPS = [
  'Brust', 'Rücken', 'Beine', 'Schultern', 'Arme', 'Core', 'Po', 'Cardio', 'Nacken', 'Unterarme',
];

// The exercise library is essentially static reference data (~439 rows). Re-fetching
// it on every app cold-start was the main driver of Supabase egress, so we persist it
// in localStorage and only hit the network once per device (until CACHE_VERSION bumps).
// BUMP CACHE_VERSION whenever the exercises table changes (new exercises via migration).
const CACHE_VERSION = 4;
const CACHE_KEY = 'adlr_exercises_cache';
const COLUMNS = 'id, name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues';

let cache: ExerciseRow[] | null = null;

export async function fetchExercises(): Promise<ExerciseRow[]> {
  if (cache) return cache;

  // Persistent cache: skip the network entirely if we already have this version.
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === CACHE_VERSION && Array.isArray(parsed.rows)) {
        cache = parsed.rows as ExerciseRow[];
        return cache;
      }
    }
  } catch { /* ignore malformed/blocked storage */ }

  const { data, error } = await supabase
    .from('exercises')
    .select(COLUMNS)
    .order('name');
  if (error) throw error;
  cache = (data ?? []) as ExerciseRow[];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: CACHE_VERSION, rows: cache }));
  } catch { /* storage full/blocked — memory cache still applies for this session */ }
  return cache;
}

export function clearExerciseCache() {
  cache = null;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}
