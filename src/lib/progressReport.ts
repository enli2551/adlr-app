import { supabase } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';
import { mondayOf } from '@/lib/weeklyRecap';
import type { Profile } from '@/lib/types';

// Goal-driven progress report: the client's primary onboarding goal decides which
// story is told first (fat loss → weight/waist/calories, muscle → strength curve,
// otherwise health & consistency). The same stats object also feeds the AI coach
// summary (coach-report Edge Function), so keep it compact and number-only.

export type GoalFocus = 'fatloss' | 'muscle' | 'health';

export interface Delta { start: number; current: number; delta: number }
export interface StrengthGain { name: string; from: number; to: number; pct: number; weeks: number; points: { date: string; e1rm: number }[] }
export interface Trend { recent: number | null; previous: number | null }

export interface ProgressStats {
  focus: GoalFocus;
  goal: string | null; // German goal key from onboarding (translate for display)
  firstWorkoutAt: string | null;
  weeksSinceStart: number;
  totalWorkouts: number;
  consistency: { weeksHit: number; weeksTotal: number; target: number };
  weight: (Delta & { points: { date: string; value: number }[] }) | null;
  waist: Delta | null;
  measurements: { key: 'weight_kg' | 'waist_cm' | 'chest_cm' | 'hips_cm' | 'arm_cm' | 'thigh_cm'; start: number; current: number }[];
  kcal: { target: number; adherencePct: number; daysLogged: number } | null;
  strength: StrengthGain[];
  steps: Trend;
  sleepMin: Trend;
  restingHr: Trend;
  photos: { first: string; latest: string; firstDate: string; latestDate: string } | null;
}

const DAY = 86400000;
const e1rm = (w: number, r: number) => (r <= 1 ? w : r > 12 ? w : w * (1 + r / 30));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function focusOf(goal: string | null | undefined): GoalFocus {
  if (goal === 'Gewicht reduzieren') return 'fatloss';
  if (goal === 'Muskeln aufbauen') return 'muscle';
  return 'health';
}

export async function computeProgress(client: Profile): Promise<ProgressStats> {
  const id = client.id;
  const since56 = localDateKey(new Date(Date.now() - 56 * DAY));
  const [wc, sl, pe, hd, ph, cp] = await Promise.all([
    supabase.from('workout_completions').select('id, completed_at').eq('client_id', id).order('completed_at', { ascending: true }),
    supabase.from('exercise_set_logs').select('workout_completion_id, exercise_name, weight_kg, reps, set_type, created_at').eq('client_id', id).order('created_at', { ascending: true }),
    supabase.from('progress_entries').select('*').eq('client_id', id).order('logged_at', { ascending: true }),
    supabase.from('health_daily').select('day, steps, sleep_min, resting_hr, kcal_in').eq('client_id', id).gte('day', since56),
    supabase.from('progress_photos').select('storage_path, photo_date').eq('client_id', id).order('photo_date', { ascending: true }),
    supabase.from('client_plans').select('plan_id').eq('client_id', id).eq('is_active', true).maybeSingle(),
  ]);

  const comps = (wc.data ?? []) as { id: string; completed_at: string }[];
  const goal = client.intake?.goals?.[0] ?? null;

  // ── Consistency: last 8 COMPLETE weeks since the first workout vs. weekly target ──
  let target = 0;
  if (cp.data) {
    const { data: pd } = await supabase.from('plan_days').select('is_rest_day').eq('plan_id', (cp.data as { plan_id: string }).plan_id);
    target = ((pd ?? []) as { is_rest_day: boolean }[]).filter((d) => !d.is_rest_day).length;
  }
  const thisMonday = mondayOf(new Date());
  const firstAt = comps[0]?.completed_at ?? null;
  const firstMonday = firstAt ? mondayOf(new Date(firstAt)) : null;
  let weeksHit = 0, weeksTotal = 0;
  for (let w = 1; w <= 8; w++) {
    const start = new Date(thisMonday.getTime() - w * 7 * DAY);
    if (!firstMonday || start < firstMonday) break;
    const end = new Date(start.getTime() + 7 * DAY);
    const n = comps.filter((c) => { const d = new Date(c.completed_at); return d >= start && d < end; }).length;
    weeksTotal++;
    if (target > 0 ? n >= target : n > 0) weeksHit++;
  }

  // ── Body: weight / waist / all measurements (first vs latest) ──
  const entries = (pe.data ?? []) as Record<string, number | string | null>[];
  const series = (key: string) => entries.filter((e) => e[key] != null).map((e) => ({ date: e.logged_at as string, value: Number(e[key]) }));
  const deltaOf = (pts: { value: number }[]): Delta | null => (pts.length >= 2 ? { start: pts[0].value, current: pts[pts.length - 1].value, delta: round1(pts[pts.length - 1].value - pts[0].value) } : null);
  const weightPts = series('weight_kg');
  const weightDelta = deltaOf(weightPts);
  const keys = ['weight_kg', 'waist_cm', 'chest_cm', 'hips_cm', 'arm_cm', 'thigh_cm'] as const;
  const measurements = keys.flatMap((k) => { const d = deltaOf(series(k)); return d ? [{ key: k, start: d.start, current: d.current }] : []; });

  // ── Calories vs. coach target (last 28 days, ±10 % counts as on target) ──
  const health = (hd.data ?? []) as { day: string; steps: number | null; sleep_min: number | null; resting_hr: number | null; kcal_in: number | null }[];
  const cut28 = localDateKey(new Date(Date.now() - 28 * DAY));
  let kcal: ProgressStats['kcal'] = null;
  if (client.kcal_target) {
    const logged = health.filter((h) => h.day >= cut28 && h.kcal_in && h.kcal_in > 0);
    if (logged.length > 0) {
      const ok = logged.filter((h) => Math.abs((h.kcal_in as number) / client.kcal_target! - 1) <= 0.1).length;
      kcal = { target: client.kcal_target, adherencePct: Math.round((ok / logged.length) * 100), daysLogged: logged.length };
    }
  }

  // ── Health trends: last 28 days vs. the 28 before ──
  const trend = (pick: (h: typeof health[number]) => number | null): Trend => {
    const avg = (rows: typeof health) => { const v = rows.map(pick).filter((x): x is number => x != null && x > 0); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    return { recent: avg(health.filter((h) => h.day >= cut28)), previous: avg(health.filter((h) => h.day < cut28)) };
  };

  // ── Strength: estimated 1RM per session, last 8 weeks, top exercises ──
  const logs = (sl.data ?? []) as { workout_completion_id: string | null; exercise_name: string; weight_kg: number | null; reps: number | null; set_type?: string | null; created_at: string }[];
  const cut8w = Date.now() - 56 * DAY;
  const bestBySession = new Map<string, Map<string, { date: string; e1rm: number }>>();
  for (const l of logs) {
    if (l.weight_kg == null || !l.reps || l.set_type === 'warmup' || new Date(l.created_at).getTime() < cut8w) continue;
    const sess = l.workout_completion_id ?? l.created_at.slice(0, 10);
    const perEx = bestBySession.get(l.exercise_name) ?? new Map();
    const v = e1rm(l.weight_kg, l.reps);
    const cur = perEx.get(sess);
    if (!cur || v > cur.e1rm) perEx.set(sess, { date: l.created_at, e1rm: v });
    bestBySession.set(l.exercise_name, perEx);
  }
  const strength: StrengthGain[] = [...bestBySession.entries()]
    .map(([name, m]) => {
      const points = [...m.values()].sort((a, b) => a.date.localeCompare(b.date)).map((p) => ({ date: p.date, e1rm: round1(p.e1rm) }));
      if (points.length < 2) return null;
      const from = points[0].e1rm, to = points[points.length - 1].e1rm;
      const weeks = Math.max(1, Math.round((new Date(points[points.length - 1].date).getTime() - new Date(points[0].date).getTime()) / (7 * DAY)));
      return { name, from, to, pct: from > 0 ? Math.round(((to - from) / from) * 100) : 0, weeks, points, n: points.length };
    })
    .filter((x): x is StrengthGain & { n: number } => !!x)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .sort((a, b) => b.pct - a.pct)
    .map(({ n: _n, ...s }) => s);

  // ── Photos: day 1 vs. today ──
  const photos = (ph.data ?? []) as { storage_path: string; photo_date: string }[];

  return {
    focus: focusOf(goal),
    goal,
    firstWorkoutAt: firstAt,
    weeksSinceStart: firstMonday ? Math.max(1, Math.round((thisMonday.getTime() - firstMonday.getTime()) / (7 * DAY)) + 1) : 0,
    totalWorkouts: comps.length,
    consistency: { weeksHit, weeksTotal, target },
    weight: weightDelta ? { ...weightDelta, points: weightPts } : null,
    waist: deltaOf(series('waist_cm')),
    measurements,
    kcal,
    strength,
    steps: trend((h) => h.steps),
    sleepMin: trend((h) => h.sleep_min),
    restingHr: trend((h) => h.resting_hr),
    photos: photos.length >= 2 ? { first: photos[0].storage_path, latest: photos[photos.length - 1].storage_path, firstDate: photos[0].photo_date, latestDate: photos[photos.length - 1].photo_date } : null,
  };
}

/** Compact, number-only version for the AI prompt (no storage paths, no chart points). */
export function statsForAI(s: ProgressStats) {
  return {
    focus: s.focus,
    goal: s.goal,
    weeksSinceStart: s.weeksSinceStart,
    totalWorkouts: s.totalWorkouts,
    consistency: s.consistency,
    weightKg: s.weight && { start: s.weight.start, current: s.weight.current, delta: s.weight.delta },
    waistCm: s.waist,
    measurements: s.measurements,
    calories: s.kcal,
    strength: s.strength.map(({ points: _p, ...g }) => g),
    avgSteps: s.steps,
    avgSleepMin: s.sleepMin,
    restingHeartRate: s.restingHr,
    hasBeforeAfterPhotos: !!s.photos,
  };
}
