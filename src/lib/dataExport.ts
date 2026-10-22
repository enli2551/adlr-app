import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { t } from '@/lib/i18n';

// "Meine Daten exportieren" (GDPR Art. 15/20): everything stored ABOUT the logged-in person,
// as one JSON file. Every query is filtered to the caller's own id explicitly — RLS would let a
// coach read their clients' rows too, and those must never end up in the coach's own export.
// A coach additionally gets the data they created as a coach (plans, packages, payments …).

type Q = (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;

async function grab(out: Record<string, unknown>, errors: string[], name: string, page: Q) {
  const { data, error } = await fetchAll(page);
  if (error) errors.push(name);
  out[name] = data;
}

export async function buildExport(uid: string, role: string | null | undefined): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  const own = (table: string, col = 'client_id', select = '*') =>
    grab(out, errors, table, (a, b) => supabase.from(table).select(select).eq(col, uid).range(a, b));

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  out.profile = profile;

  await Promise.all([
    own('workout_completions'), own('exercise_set_logs'), own('personal_records'), own('progress_entries'),
    own('progress_photos'), own('daily_checkins'), own('weekly_checkins'), own('messages'), own('hydration_logs'),
    own('nutrition_principle_checkins'), own('health_daily'), own('food_logs'), own('custom_foods', 'owner_id'),
    own('client_plans'), own('weekly_messages'), own('nutrition_tips'), own('client_packages'), own('streak_freezes'),
    own('upsell_requests'),
    grab(out, errors, 'progress_reports', (a, b) => supabase.from('progress_reports').select('*').eq('client_id', uid).eq('status', 'approved').range(a, b)),
    grab(out, errors, 'sessions', (a, b) => supabase.from('sessions').select('*').or(`client_id.eq.${uid},trainer_id.eq.${uid}`).range(a, b)),
  ]);

  // The plans assigned to me (with their days)
  const planIds = [...new Set(((out.client_plans as { plan_id: string }[] | null) ?? []).map((c) => c.plan_id))];

  if (role === 'trainer') {
    await Promise.all([
      grab(out, errors, 'plans', (a, b) => supabase.from('plans').select('*').eq('trainer_id', uid).range(a, b)),
      own('exercises', 'trainer_id'), own('coach_questions', 'trainer_id'), own('coach_exercise_media', 'trainer_id'),
      own('packages', 'trainer_id'), own('payments', 'trainer_id'), own('business_revenue', 'trainer_id'),
      own('monthly_challenges', 'trainer_id'), own('ai_usage', 'trainer_id'),
      grab(out, errors, 'client_packages_sold', (a, b) => supabase.from('client_packages').select('*').eq('trainer_id', uid).range(a, b)),
    ]);
    planIds.push(...((out.plans as { id: string }[] | null) ?? []).map((p) => p.id));
  } else if (planIds.length) {
    await grab(out, errors, 'plans', (a, b) => supabase.from('plans').select('*').in('id', planIds).range(a, b));
  }
  const ids = [...new Set(planIds)];
  out.plan_days = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data } = await fetchAll((a, b) => supabase.from('plan_days').select('*').in('plan_id', chunk).range(a, b));
    (out.plan_days as unknown[]).push(...data);
  }

  return {
    export: { app: 'ADLR', created_at: new Date().toISOString(), user_id: uid, role: role ?? null, incomplete_tables: errors },
    note: 'Progress photos and coach voice/video replies are files; progress_photos lists them. Ask your coach or support for a copy of the files.',
    ...out,
  };
}

/** Native: share sheet with the JSON file (save to Files / Drive / mail). Web: download. */
export async function saveExport(data: Record<string, unknown>): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const name = `adlr-export-${new Date().toISOString().slice(0, 10)}.json`;
  const text = JSON.stringify(data, null, 2);
  try {
    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const res = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ files: [res.uri], dialogTitle: t('Meine Daten exportieren') });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof Error && /cancel|abort/i.test(e.message + e.name)) return 'cancelled';
    throw e;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
