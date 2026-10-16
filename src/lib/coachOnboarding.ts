import { supabase } from '@/lib/supabase';
import type { Plan, Profile } from '@/lib/types';

/** Wizard progress, stored in profiles.coach_onboarding (migration 20261016b). */
export interface CoachOnboardingState {
  step?: number;
  skipped?: boolean;
  checklist_dismissed?: boolean;
  done?: Partial<Record<'name' | 'branding' | 'package' | 'plan' | 'invite', boolean>>;
}

export const ONBOARDING_STEPS = 6;

/** The wizard only runs once the migration exists (the column is then present, NULL = not done). */
export function needsCoachOnboarding(p: Profile | null): boolean {
  return !!p && p.role === 'trainer' && 'coach_onboarded_at' in p && p.coach_onboarded_at == null;
}

// Local mirror: a step reached offline (or before the write lands) still resumes there.
const localKey = (uid: string) => `adlr_coach_onb_${uid}`;
export function readLocalState(uid: string): CoachOnboardingState {
  try { return JSON.parse(localStorage.getItem(localKey(uid)) || '{}') as CoachOnboardingState; } catch { return {}; }
}

export async function saveOnboardingState(uid: string, state: CoachOnboardingState, finished = false) {
  try { localStorage.setItem(localKey(uid), JSON.stringify(state)); } catch { /* ignore */ }
  const patch: Record<string, unknown> = { coach_onboarding: state };
  if (finished) patch.coach_onboarded_at = new Date().toISOString();
  return supabase.from('profiles').update(patch).eq('id', uid);
}

/** Opens the wizard again at one step (from the Übersicht checklist). */
export async function reopenOnboarding(uid: string, state: CoachOnboardingState, step: number) {
  const next = { ...state, step, skipped: false };
  try { localStorage.setItem(localKey(uid), JSON.stringify(next)); } catch { /* ignore */ }
  return supabase.from('profiles').update({ coach_onboarding: next, coach_onboarded_at: null }).eq('id', uid);
}

/** Starter plans everyone can read (plans.is_starter) — offered as a first template. */
export async function loadStarterPlans(): Promise<(Plan & { training_days: number })[]> {
  const { data } = await supabase.from('plans').select('*').eq('is_starter', true).order('created_at');
  const plans = (data ?? []) as Plan[];
  if (!plans.length) return [];
  const { data: days } = await supabase.from('plan_days').select('plan_id, is_rest_day').in('plan_id', plans.map((p) => p.id));
  const count = (id: string) => ((days ?? []) as { plan_id: string; is_rest_day: boolean }[]).filter((d) => d.plan_id === id && !d.is_rest_day).length;
  return plans.map((p) => ({ ...p, training_days: count(p.id) }));
}

/** Copies a plan (days + program settings) into the coach's own templates. */
export async function copyPlanAsTemplate(coachId: string, src: Plan): Promise<string | null> {
  const name = `${src.name.replace(/\s*\(Vorlage\)\s*$/, '')} (Vorlage)`;
  const program = src.weeks && src.weeks > 1 ? { weeks: src.weeks, week_rules: src.week_rules ?? null } : {};
  const { data, error } = await supabase.from('plans').insert({ trainer_id: coachId, name, is_template: true, ...program }).select('id').single();
  if (error || !data) return null;
  const { data: pds } = await supabase.from('plan_days').select('*').eq('plan_id', src.id);
  const rows = (pds ?? []).map((d) => ({
    plan_id: data.id, day_of_week: d.day_of_week, workout_name: d.workout_name, focus: d.focus,
    difficulty: d.difficulty, duration_min: d.duration_min, notes: d.notes, exercises: d.exercises, is_rest_day: d.is_rest_day,
  }));
  if (rows.length) await supabase.from('plan_days').insert(rows);
  return data.id as string;
}

export interface ChecklistStatus {
  branding: boolean; package: boolean; plan: boolean; client: boolean;
  intake: boolean; checkin: boolean; calendar: boolean;
}

/** What the new coach has set up so far (drives the Übersicht checklist). */
export async function loadChecklistStatus(p: Profile): Promise<ChecklistStatus> {
  const head = { count: 'exact' as const, head: true };
  const [pk, pl, cl, qi, qc, se] = await Promise.all([
    supabase.from('packages').select('id', head).eq('trainer_id', p.id),
    supabase.from('plans').select('id', head).eq('trainer_id', p.id),
    supabase.from('profiles').select('id', head).eq('role', 'client').eq('trainer_id', p.id),
    supabase.from('coach_questions').select('id', head).eq('trainer_id', p.id).eq('context', 'intake'),
    supabase.from('coach_questions').select('id', head).eq('trainer_id', p.id).eq('context', 'checkin'),
    supabase.from('sessions').select('id', head).eq('trainer_id', p.id),
  ]);
  return {
    branding: !!(p.brand_color || p.brand_logo),
    package: (pk.count ?? 0) > 0,
    plan: (pl.count ?? 0) > 0,
    client: (cl.count ?? 0) > 0,
    intake: (qi.count ?? 0) > 0,
    checkin: (qc.count ?? 0) > 0,
    calendar: (se.count ?? 0) > 0,
  };
}
