import { supabase } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';
import { t, fmtNum } from '@/lib/i18n';

// Monthly challenge + leaderboard, weekly check-in, streak freeze
// (migration 20261002_engagement.sql). Every loader degrades to "nothing" when the
// migration isn't run yet, so the screens keep working.

export function mondayKey(d: Date): string {
  const m = new Date(d);
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateKey(m);
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── Monthly challenge ────────────────────────────────────────────────────────
export type ChallengeMetric = 'workouts' | 'volume' | 'minutes';
export interface Challenge { id?: string; trainer_id?: string; month: string; metric: ChallengeMetric; goal: number; title: string | null }
export interface BoardRow { client_id: string; display_name: string; value: number; opted_in: boolean; is_me: boolean }

export const DEFAULT_CHALLENGE: Omit<Challenge, 'month'> = { metric: 'workouts', goal: 12, title: null };

export const METRIC_LABEL: Record<ChallengeMetric, string> = {
  workouts: 'Trainings',
  volume: 'Volumen',
  minutes: 'Trainingsminuten',
};

export function fmtMetric(metric: ChallengeMetric, v: number): string {
  if (metric === 'volume') return v >= 10000 ? `${fmtNum(Math.round(v / 100) / 10)} t` : `${fmtNum(Math.round(v))} kg`;
  if (metric === 'minutes') return `${fmtNum(Math.round(v))} min`;
  return fmtNum(Math.round(v));
}

export function challengeTitle(c: Pick<Challenge, 'metric' | 'goal' | 'title'>): string {
  if (c.title) return c.title;
  if (c.metric === 'workouts') return t('{n} Trainings in diesem Monat', { n: c.goal });
  if (c.metric === 'minutes') return t('{n} Trainingsminuten in diesem Monat', { n: fmtNum(c.goal) });
  return t('{v} bewegt in diesem Monat', { v: fmtMetric('volume', c.goal) });
}

/** The coach's challenge for the month (or the default) + the ranking, best first. */
export async function loadChallenge(coachId: string | null | undefined, month = monthKey()): Promise<{ challenge: Challenge; board: BoardRow[]; available: boolean }> {
  const fallback = { challenge: { ...DEFAULT_CHALLENGE, month }, board: [], available: false };
  if (!coachId) return fallback;
  const [c, b] = await Promise.all([
    supabase.from('monthly_challenges').select('*').eq('trainer_id', coachId).eq('month', month).maybeSingle(),
    supabase.rpc('challenge_board', { p_month: month }),
  ]);
  if (b.error) return fallback;
  const challenge = (c.data as Challenge | null) ?? { ...DEFAULT_CHALLENGE, month };
  const board = ((b.data ?? []) as BoardRow[])
    .map((r) => ({ ...r, value: Number(r.value) || 0 }))
    .sort((x, y) => y.value - x.value || x.display_name.localeCompare(y.display_name));
  return { challenge: { ...challenge, goal: Number(challenge.goal) }, board, available: true };
}

// ── Weekly check-in ──────────────────────────────────────────────────────────
export interface WeeklyCheckin {
  id: string; client_id: string; week_start: string;
  weight_kg: number | null; energy: number | null; sleep: number | null; stress: number | null; nutrition: number | null;
  wins: string | null; struggles: string | null; trainer_reply: string | null; replied_at: string | null; created_at: string;
}

/** Which week a check-in is due for right now: Fri–Sun → this week, Monday → last week, else none. */
export function dueCheckinWeek(now = new Date()): string | null {
  const dow = now.getDay(); // 0 = Sunday
  if (dow === 5 || dow === 6 || dow === 0) return mondayKey(now);
  if (dow === 1) { const d = new Date(now); d.setDate(d.getDate() - 7); return mondayKey(d); }
  return null;
}

// ── Streak freeze ────────────────────────────────────────────────────────────
export async function loadFrozenWeeks(clientId: string): Promise<{ weeks: Set<string>; usedThisMonth: boolean }> {
  const { data, error } = await supabase.from('streak_freezes').select('week_start, created_at').eq('client_id', clientId);
  if (error || !data) return { weeks: new Set(), usedThisMonth: false };
  const m = monthKey().slice(0, 7);
  return {
    weeks: new Set((data as { week_start: string }[]).map((r) => r.week_start)),
    usedThisMonth: (data as { created_at: string }[]).some((r) => localDateKey(r.created_at).slice(0, 7) === m),
  };
}

export async function applyStreakFreeze(weekStart: string): Promise<string | null> {
  const { error } = await supabase.rpc('use_streak_freeze', { p_week_start: weekStart });
  if (!error) return null;
  if (/already_used/.test(error.message)) return t('Diesen Monat schon verwendet.');
  return t('Konnte nicht gespeichert werden.');
}

// ── Local reminders (native only; ids below the recap/session ranges) ────────
const STREAK_NOTIF = 898_001;
const CHECKIN_NOTIF = 898_002;
const CHANNEL = 'engagement';

async function reschedule(id: number, at: Date | null, title: string, body: string): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.getPlatform() === 'web') return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    await LocalNotifications.createChannel({ id: CHANNEL, name: t('Serie & Check-in'), description: t('Erinnerungen an dein Wochenziel und den Check-in'), importance: 3 }).catch(() => {});
    await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
    if (!at || at.getTime() <= Date.now()) return;
    await LocalNotifications.schedule({ notifications: [{ id, title, body, schedule: { at }, channelId: CHANNEL }] });
  } catch { /* permission revoked / unsupported */ }
}

/** Saturday 10:00 nudge while the weekly goal is still open (cancelled once it's reached). */
export function scheduleStreakReminder(streakWeeks: number, missing: number): Promise<void> {
  const sat = new Date();
  sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7));
  sat.setHours(10, 0, 0, 0);
  if (missing <= 0) return reschedule(STREAK_NOTIF, null, '', '');
  return reschedule(
    STREAK_NOTIF, sat,
    streakWeeks > 0 ? t('Deine Serie: {n} Wochen 🔥', { n: streakWeeks }) : t('Dein Wochenziel wartet'),
    missing === 1 ? t('Noch 1 Training bis zu deinem Wochenziel — du schaffst das!') : t('Noch {n} Trainings bis zu deinem Wochenziel — du schaffst das!', { n: missing }),
  );
}

/** Sunday 17:00 check-in reminder, unless this week's check-in is already done. */
export function scheduleCheckinReminder(done: boolean, coach: string): Promise<void> {
  const sun = new Date();
  sun.setDate(sun.getDate() + ((7 - sun.getDay()) % 7));
  sun.setHours(17, 0, 0, 0);
  return reschedule(CHECKIN_NOTIF, done ? null : sun, t('Wöchentlicher Check-in'), t('1 Minute für {coach}: Wie war deine Woche?', { coach }));
}
