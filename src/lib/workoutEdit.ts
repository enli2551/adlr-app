import { supabase } from '@/lib/supabase';
import { isNetworkError, outbox, uuid } from '@/lib/offline';
import type { WorkoutCompletion, ExerciseSetLog } from '@/lib/types';
import { t } from '@/lib/i18n';

// Editing / deleting a saved workout afterwards (client in their log + calendar, coach in
// ClientDetail — RLS "own_or_coach" allows both). Personal records detected when the
// workout was finished carry no link to it, only a timestamp right at the finish, so the
// ones in that window are removed and re-detected from the edited sets.

export interface EditSet {
  weight: string;
  reps: string;
  type: 'working' | 'warmup' | 'dropset';
  min: string;
  km: string;
}
export interface EditExercise { name: string; sets: EditSet[] }
export interface WorkoutPatch {
  completed_at: string;
  duration_sec: number | null;
  title: string | null;
  gym: string | null;
}

/** A workout that is still waiting in the offline outbox can't be edited yet. */
export function isPendingUpload(id: string): boolean {
  return outbox().some((q) => q.localId === id && !q.logsSent);
}

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** Auto-PRs written at the finish of this workout (±window around its time). */
async function prsOfWorkout(clientId: string, completedAt: string) {
  const at = new Date(completedAt).getTime();
  const { data } = await supabase.from('personal_records').select('*').eq('client_id', clientId)
    .gte('achieved_at', new Date(at - 2 * 60000).toISOString()).lte('achieved_at', new Date(at + 15 * 60000).toISOString());
  return (data ?? []) as { id: string; exercise_name: string; weight_kg: number; gym?: string | null }[];
}

async function rebuildPRs(clientId: string, oldCompletedAt: string, newCompletedAt: string | null, logs: { exercise_name: string; weight_kg: number | null; reps: number | null; set_type: string }[]) {
  const old = await prsOfWorkout(clientId, oldCompletedAt);
  const gymOf = new Map(old.map((p) => [p.exercise_name, p.gym ?? null]));
  if (old.length > 0) await supabase.from('personal_records').delete().in('id', old.map((p) => p.id));
  if (!newCompletedAt) return;
  const best = new Map<string, { weight_kg: number; reps: number }>();
  for (const l of logs) {
    if (l.weight_kg == null || l.set_type === 'warmup') continue;
    const cur = best.get(l.exercise_name);
    if (!cur || l.weight_kg > cur.weight_kg) best.set(l.exercise_name, { weight_kg: l.weight_kg, reps: l.reps ?? 0 });
  }
  if (best.size === 0) return;
  const { data: rest } = await supabase.from('personal_records').select('exercise_name, weight_kg, gym').eq('client_id', clientId).in('exercise_name', [...best.keys()]);
  const rows: Record<string, unknown>[] = [];
  for (const [name, b] of best) {
    const gym = gymOf.get(name) ?? null;
    const prevMax = ((rest ?? []) as { exercise_name: string; weight_kg: number; gym?: string | null }[])
      .filter((p) => p.exercise_name === name && (gym ? p.gym === gym : true))
      .reduce((m, p) => Math.max(m, Number(p.weight_kg)), 0);
    if (b.weight_kg > prevMax) rows.push({ client_id: clientId, exercise_name: name, weight_kg: b.weight_kg, reps: b.reps, achieved_at: newCompletedAt, ...(gym ? { gym } : {}) });
  }
  if (rows.length > 0) {
    const { error } = await supabase.from('personal_records').insert(rows);
    if (error) await supabase.from('personal_records').insert(rows.map(({ gym: _g, ...r }) => r));
  }
}

export async function deleteWorkout(c: WorkoutCompletion): Promise<string | null> {
  const { error } = await supabase.from('workout_completions').delete().eq('id', c.id); // set logs: ON DELETE CASCADE
  if (error) return isNetworkError(error) ? t('Keine Verbindung — bitte versuche es gleich nochmal.') : error.message;
  await rebuildPRs(c.client_id, c.completed_at, null, []).catch(() => {});
  return null;
}

/** Saves the edited workout: completion fields + all its sets (replaced as a whole). */
export async function saveWorkoutEdit(c: WorkoutCompletion, oldLogs: ExerciseSetLog[], patch: WorkoutPatch, exercises: EditExercise[]): Promise<string | null> {
  // 1. Completion row (newest columns first, in case a migration is missing).
  let { error } = await supabase.from('workout_completions').update(patch).eq('id', c.id);
  if (error && !isNetworkError(error)) ({ error } = await supabase.from('workout_completions').update({ completed_at: patch.completed_at }).eq('id', c.id));
  if (error) return isNetworkError(error) ? t('Keine Verbindung — bitte versuche es gleich nochmal.') : error.message;

  // 2. Sets: insert the new version first, then remove the old rows — never lose data halfway.
  const rows = exercises.flatMap((ex) => ex.sets
    .map((s) => ({ s, w: num(s.weight), r: num(s.reps), dur: s.min.trim() ? Math.round(Number(s.min.replace(',', '.')) * 60) : null, km: num(s.km) }))
    .filter((x) => x.w != null || x.r != null || x.dur != null || x.km != null)
    .map((x, i) => ({
      id: uuid(), client_id: c.client_id, workout_completion_id: c.id, plan_day_id: c.plan_day_id,
      exercise_name: ex.name, set_number: i + 1, weight_kg: x.w, reps: x.r == null ? null : Math.round(x.r),
      set_type: x.s.type, duration_sec: x.dur, distance_km: x.km, created_at: patch.completed_at,
    })));
  if (rows.length > 0) {
    let { error: insErr } = await supabase.from('exercise_set_logs').insert(rows);
    if (insErr && !isNetworkError(insErr)) ({ error: insErr } = await supabase.from('exercise_set_logs').insert(rows.map(({ set_type: _s, duration_sec: _d, distance_km: _k, ...r }) => r)));
    if (insErr) return isNetworkError(insErr) ? t('Keine Verbindung — bitte versuche es gleich nochmal.') : insErr.message;
  }
  const oldIds = oldLogs.map((l) => l.id);
  for (let i = 0; i < oldIds.length; i += 200) {
    const { error: delErr } = await supabase.from('exercise_set_logs').delete().in('id', oldIds.slice(i, i + 200));
    if (delErr) {
      // Roll back the copy so the workout isn't doubled.
      if (rows.length > 0) await supabase.from('exercise_set_logs').delete().in('id', rows.map((r) => r.id));
      return delErr.message;
    }
  }
  await rebuildPRs(c.client_id, c.completed_at, patch.completed_at, rows).catch(() => {});
  return null;
}
