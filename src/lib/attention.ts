import { supabase } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';
import type { Profile } from '@/lib/types';
import { t } from '@/lib/i18n';

export type AttentionKind = 'message' | 'no_plan' | 'inactive' | 'behind' | 'low_checkin';

export interface AttentionItem {
  client: Profile;
  kind: AttentionKind;
  text: string;
  days?: number; // 'inactive': days since last training (undefined = 5+ weeks)
  severity: number; // higher = more urgent (sort key)
}

const INACTIVE_DAYS = 5;

/**
 * "Braucht Aufmerksamkeit" — clients the trainer should look at today. All queries are
 * scoped to the trainer's own client ids (the RLS policies are permissive for trainers).
 */
export async function computeAttention(clients: Profile[]): Promise<AttentionItem[]> {
  const ids = clients.map((c) => c.id);
  if (ids.length === 0) return [];
  const since = new Date(); since.setDate(since.getDate() - 35);
  const since3 = new Date(); since3.setDate(since3.getDate() - 3);

  const [cp, wc, msg, ck] = await Promise.all([
    supabase.from('client_plans').select('client_id, plan_id').in('client_id', ids).eq('is_active', true),
    supabase.from('workout_completions').select('client_id, completed_at').in('client_id', ids).gte('completed_at', since.toISOString()),
    supabase.from('messages').select('client_id, sender, sent_at').in('client_id', ids).gte('sent_at', since.toISOString()).order('sent_at', { ascending: false }),
    supabase.from('daily_checkins').select('client_id, energy, mood, logged_at').in('client_id', ids).gte('logged_at', localDateKey(since3)),
  ]);

  const planByClient = new Map<string, string>();
  for (const r of (cp.data ?? []) as { client_id: string; plan_id: string }[]) planByClient.set(r.client_id, r.plan_id);
  const planIds = [...new Set(planByClient.values())];
  const targetByPlan = new Map<string, number>();
  if (planIds.length > 0) {
    const { data: pd } = await supabase.from('plan_days').select('plan_id, is_rest_day').in('plan_id', planIds);
    for (const d of (pd ?? []) as { plan_id: string; is_rest_day: boolean }[]) {
      if (!d.is_rest_day) targetByPlan.set(d.plan_id, (targetByPlan.get(d.plan_id) ?? 0) + 1);
    }
  }

  const now = new Date();
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow);
  const weekStartKey = localDateKey(weekStart);

  const items: AttentionItem[] = [];
  for (const c of clients) {
    const name = c.first_name?.trim() || t('Klient');
    // 1) Unanswered message: newest message in the thread is from the client
    const last = ((msg.data ?? []) as { client_id: string; sender: string; sent_at: string }[]).find((m) => m.client_id === c.id);
    if (last && last.sender === 'client') {
      const h = Math.round((now.getTime() - new Date(last.sent_at).getTime()) / 3600000);
      items.push({ client: c, kind: 'message', severity: 50 + Math.min(h, 48), text: `${t('{name} wartet auf Antwort', { name })} (${h < 1 ? t('gerade eben') : h < 24 ? t('vor {n} Std.', { n: h }) : t('vor {n} Tagen', { n: Math.round(h / 24) })})` });
    }
    // 2) No active plan (only once onboarding is done — before that it's expected)
    const planId = planByClient.get(c.id);
    if (!planId) {
      if (c.intake_completed) items.push({ client: c, kind: 'no_plan', severity: 45, text: t('{name} hat keinen aktiven Plan', { name }) });
      continue;
    }
    // 3) Inactive: days since the last training
    const comps = ((wc.data ?? []) as { client_id: string; completed_at: string }[]).filter((x) => x.client_id === c.id);
    const lastAt = comps.reduce<string | null>((m, x) => (!m || x.completed_at > m ? x.completed_at : m), null);
    const daysSince = lastAt ? Math.floor((now.getTime() - new Date(lastAt).getTime()) / 86400000) : null;
    if (daysSince == null || daysSince >= INACTIVE_DAYS) {
      items.push({ client: c, kind: 'inactive', severity: 30 + Math.min(daysSince ?? 35, 35), days: daysSince ?? undefined, text: daysSince == null ? t('{name}: seit über 5 Wochen kein Training', { name }) : t('{name}: seit {n} Tagen kein Training', { name, n: daysSince }) });
    } else {
      // 4) Weekly target no longer reachable in the days left this week
      const target = targetByPlan.get(planId) ?? 0;
      const doneThisWeek = comps.filter((x) => localDateKey(x.completed_at) >= weekStartKey).length;
      const remaining = target - doneThisWeek;
      if (target > 0 && remaining > 7 - dow) {
        items.push({ client: c, kind: 'behind', severity: 25, text: `${t('{name}: Wochenziel in Gefahr', { name })} (${doneThisWeek}/${target})` });
      }
    }
    // 5) Low energy/mood in the last 3 days' check-ins
    const lows = ((ck.data ?? []) as { client_id: string; energy: number; mood: number }[]).filter((x) => x.client_id === c.id && (x.energy <= 2 || x.mood <= 2));
    if (lows.length > 0) items.push({ client: c, kind: 'low_checkin', severity: 20, text: t('{name}: niedrige Energie/Stimmung im Check-in', { name }) });
  }
  return items.sort((a, b) => b.severity - a.severity);
}
