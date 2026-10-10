import { supabase } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';

// The week behind a weekly check-in, collected automatically from what the app already
// knows: logged workouts (+ volume), synced health data (steps, kcal, macros, sleep,
// weight) and progress entries. Stored with the check-in when the client submits it;
// the coach view recomputes it for older check-ins that don't have it.

export interface CheckinStats {
  workouts: number;
  target: number | null;        // planned trainings per week (non-rest days of the active plan)
  minutes: number;
  sets: number;
  volume_kg: number;
  steps_avg: number | null;
  kcal_avg: number | null;
  kcal_target: number | null;
  protein_avg: number | null;
  carbs_avg: number | null;
  fat_avg: number | null;
  sleep_avg_min: number | null;
  health_days: number;           // days with any synced health data
  weight_start: number | null;   // first / last weight of the week (health or manual entries)
  weight_end: number | null;
}

const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null && !Number.isNaN(Number(x))).map(Number);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const round = (x: number | null, step = 1) => (x == null ? null : Math.round(x / step) * step);

/** weekStart = Monday (YYYY-MM-DD) of the week the check-in is about. */
export async function computeCheckinStats(clientId: string, weekStart: string, kcalTarget: number | null = null): Promise<CheckinStats> {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const lastDay = new Date(end); lastDay.setDate(lastDay.getDate() - 1);
  const dayFrom = weekStart, dayTo = localDateKey(lastDay);

  const [wc, hd, pe, cp] = await Promise.all([
    supabase.from('workout_completions').select('id, duration_sec').eq('client_id', clientId)
      .gte('completed_at', start.toISOString()).lt('completed_at', end.toISOString()),
    supabase.from('health_daily').select('*').eq('client_id', clientId).gte('day', dayFrom).lte('day', dayTo).order('day'),
    supabase.from('progress_entries').select('weight_kg, logged_at').eq('client_id', clientId)
      .gte('logged_at', dayFrom).lte('logged_at', dayTo).order('logged_at'),
    supabase.from('client_plans').select('plan_id').eq('client_id', clientId).eq('is_active', true).maybeSingle(),
  ]);

  const completions = (wc.data ?? []) as { id: string; duration_sec: number | null }[];
  let sets = 0, volume = 0;
  if (completions.length > 0) {
    const { data: logs } = await supabase.from('exercise_set_logs').select('weight_kg, reps')
      .in('workout_completion_id', completions.map((c) => c.id));
    for (const l of (logs ?? []) as { weight_kg: number | null; reps: number | null }[]) {
      sets++;
      if (l.weight_kg != null && l.reps != null) volume += Number(l.weight_kg) * l.reps;
    }
  }
  let target: number | null = null;
  if (cp.data) {
    const { data: days } = await supabase.from('plan_days').select('is_rest_day').eq('plan_id', (cp.data as { plan_id: string }).plan_id);
    target = (days ?? []).filter((d) => !(d as { is_rest_day: boolean }).is_rest_day).length || null;
  }

  type H = { steps: number | null; kcal_in: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null; sleep_min: number | null; weight_kg: number | null };
  const health = (hd.data ?? []) as H[];
  const weights = [
    ...health.map((h) => h.weight_kg),
    ...((pe.data ?? []) as { weight_kg: number | null }[]).map((p) => p.weight_kg),
  ].filter((w): w is number => w != null).map(Number);

  return {
    workouts: completions.length,
    target,
    minutes: Math.round(completions.reduce((s, c) => s + (c.duration_sec ?? 0), 0) / 60),
    sets,
    volume_kg: Math.round(volume),
    steps_avg: round(avg(health.map((h) => h.steps)), 10),
    kcal_avg: round(avg(health.map((h) => h.kcal_in)), 10),
    kcal_target: kcalTarget,
    protein_avg: round(avg(health.map((h) => h.protein_g))),
    carbs_avg: round(avg(health.map((h) => h.carbs_g))),
    fat_avg: round(avg(health.map((h) => h.fat_g))),
    sleep_avg_min: round(avg(health.map((h) => h.sleep_min))),
    health_days: health.length,
    weight_start: weights.length ? weights[0] : null,
    weight_end: weights.length ? weights[weights.length - 1] : null,
  };
}
