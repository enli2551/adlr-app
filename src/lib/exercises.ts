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
  /** set on duplicate entries: name of the exercise to use instead (hidden from pickers) */
  alias_of?: string | null;
  /** a coach's own exercise (only the coach and their clients see it); null = shared library */
  trainer_id?: string | null;
  /** coach's video for their own exercise (storage bucket 'exercise-videos') */
  video_path?: string | null;
}

export const MUSCLE_GROUPS = [
  'Brust', 'Rücken', 'Beine', 'Schultern', 'Arme', 'Core', 'Po', 'Cardio', 'Mobilität', 'Nacken', 'Unterarme',
];

// The exercise library is essentially static reference data (~439 rows). Re-fetching
// it on every app cold-start was the main driver of Supabase egress, so we persist it
// in localStorage and only hit the network once per device (until CACHE_VERSION bumps).
// BUMP CACHE_VERSION whenever the exercises table changes (new exercises via migration).
const CACHE_VERSION = 12;
const CACHE_KEY = 'adlr_exercises_cache';
const COLUMNS = 'id, name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues';

let cache: ExerciseRow[] | null = null;

// Coach-specific part (own exercises + own videos for any exercise): small, changes often,
// differs per account — loaded fresh once per session and user, never in the device cache.
let own: { uid: string | null; rows: ExerciseRow[] } | null = null;
const coachVideos = new Map<string, string>();
const listeners = new Set<() => void>();

/** Video the coach recorded for this exercise (own exercise or override of a library one). */
export function coachVideoFor(ex: { name: string; video_path?: string | null }): string | null {
  return ex.video_path || coachVideos.get(ex.name) || null;
}

async function loadCoachPart(): Promise<ExerciseRow[]> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id ?? null;
  if (own && own.uid === uid) return own.rows;
  let rows: ExerciseRow[] = [];
  coachVideos.clear();
  if (uid) {
    const [ex, media] = await Promise.all([
      supabase.from('exercises').select(COLUMNS + ', trainer_id, video_path').not('trainer_id', 'is', null).order('name'),
      supabase.from('coach_exercise_media').select('exercise_name, video_path'),
    ]);
    if (!ex.error) rows = (ex.data ?? []) as unknown as ExerciseRow[];
    if (!media.error) for (const m of (media.data ?? []) as { exercise_name: string; video_path: string }[]) coachVideos.set(m.exercise_name, m.video_path);
  }
  own = { uid, rows };
  return rows;
}

/** After a coach created/edited/deleted an exercise or a video: reload and tell open lists. */
export async function refreshCoachLibrary(): Promise<void> {
  own = null;
  await loadCoachPart();
  listeners.forEach((fn) => fn());
}
export function onCoachLibraryChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function fetchExercises(): Promise<ExerciseRow[]> {
  const shared = await fetchSharedExercises();
  const mine = await loadCoachPart().catch(() => []);
  if (mine.length === 0) return shared;
  const names = new Set(mine.map((m) => m.name));
  return [...shared.filter((e) => !names.has(e.name)), ...mine].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

async function fetchSharedExercises(): Promise<ExerciseRow[]> {
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

  // Shared library only (coach rows come separately). Before the coach-exercise migration
  // there's no trainer_id column — then everything is shared.
  let res = await supabase.from('exercises').select(COLUMNS).is('trainer_id', null).order('name');
  if (res.error) res = await supabase.from('exercises').select(COLUMNS).order('name');
  if (res.error) throw res.error;
  cache = (res.data ?? []) as ExerciseRow[];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: CACHE_VERSION, rows: cache }));
  } catch { /* storage full/blocked — memory cache still applies for this session */ }
  return cache;
}

export function clearExerciseCache() {
  cache = null;
  own = null;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

// Equipment whose load isn't comparable between gyms (different machines/pulley ratios).
// PRs for these are tracked per Studio; free weights stay global.
const GYM_DEPENDENT_EQUIPMENT = new Set(['Maschine', 'Kabelzug', 'Smith Machine']);
export function isGymDependent(equipment: string | undefined | null): boolean {
  return !!equipment && GYM_DEPENDENT_EQUIPMENT.has(equipment);
}
