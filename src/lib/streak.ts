import { localDateKey } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

// Weekly streak = consecutive calendar weeks in which the weekly training target
// (number of training days in the plan) was reached. Strength plans have rest days
// by design, so a DAILY streak is meaningless (it's ~always 1) — use this instead.
// The current week never breaks the streak (it's still in progress).

function weekBounds(ref: Date) {
  const dow = ref.getDay() === 0 ? 6 : ref.getDay() - 1;
  const start = new Date(ref);
  start.setDate(ref.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startKey: localDateKey(start), endKey: localDateKey(end) };
}

/** `frozen`: Monday keys of weeks protected with a streak freeze — they keep the streak alive but don't add to it. */
export function weeklyStreak(completedAt: string[], trainingsPerWeek: number, frozen?: Set<string>): number {
  if (trainingsPerWeek <= 0) return 0;
  const keys = completedAt.map((c) => localDateKey(c));
  const today = new Date();
  let weeks = 0;
  for (let w = 0; w < 104; w++) {
    const ref = new Date(today);
    ref.setDate(today.getDate() - w * 7);
    const { startKey, endKey } = weekBounds(ref);
    const n = keys.filter((k) => k >= startKey && k <= endKey).length;
    if (n >= trainingsPerWeek) weeks++;
    else if (frozen?.has(startKey)) continue;
    else if (w > 0) break;
  }
  return weeks;
}

/**
 * Weekly streaks for many clients at once (trainer client list): 3 batched queries
 * (active plans → their training-day counts, completions of the last year).
 */
export async function loadWeeklyStreaks(clientIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (clientIds.length === 0) return out;
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const [cp, wc] = await Promise.all([
    supabase.from('client_plans').select('client_id, plan_id').in('client_id', clientIds).eq('is_active', true),
    supabase.from('workout_completions').select('client_id, completed_at').in('client_id', clientIds).gte('completed_at', since.toISOString()),
  ]);
  const planOf = new Map(((cp.data ?? []) as { client_id: string; plan_id: string }[]).map((r) => [r.client_id, r.plan_id]));
  const planIds = [...new Set(planOf.values())];
  const target = new Map<string, number>();
  if (planIds.length > 0) {
    const { data: pd } = await supabase.from('plan_days').select('plan_id, is_rest_day').in('plan_id', planIds);
    for (const d of (pd ?? []) as { plan_id: string; is_rest_day: boolean }[]) {
      if (!d.is_rest_day) target.set(d.plan_id, (target.get(d.plan_id) ?? 0) + 1);
    }
  }
  const byClient = new Map<string, string[]>();
  for (const c of (wc.data ?? []) as { client_id: string; completed_at: string }[]) {
    const arr = byClient.get(c.client_id) ?? [];
    arr.push(c.completed_at);
    byClient.set(c.client_id, arr);
  }
  for (const id of clientIds) {
    const plan = planOf.get(id);
    out.set(id, weeklyStreak(byClient.get(id) ?? [], plan ? target.get(plan) ?? 0 : 0));
  }
  return out;
}
