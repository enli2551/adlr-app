import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';
import { t } from '@/lib/i18n';

// Weekly recap ("Deine Woche ist da"): shown once per calendar week — as a banner on
// the training screen and automatically before the first workout of the new week —
// looking back at LAST week. A local notification every Monday 08:00 announces it.

const SEEN_KEY = 'adlr_recap_seen';
const NOTIF_ID = 899_000; // below the session-reminder id range (≥ 900000)
const CHANNEL = 'weekly-recap';

// One line per calendar week (rotates by ISO week number). Own ADLR lines — keyed in
// German and translated via the dictionaries.
export const WEEKLY_QUOTES = [
  'Stärke entsteht nicht im Training, sondern im Wiederkommen.',
  'Du musst nicht motiviert sein. Du musst nur anfangen.',
  'Jede Woche, die du durchziehst, ist ein Versprechen, das du dir hältst.',
  'Kleine Schritte, jede Woche. Das ist das ganze Geheimnis.',
  'Der schwerste Satz ist der erste im Kopf.',
  'Konstanz schlägt Intensität — jedes Mal.',
  'Dein zukünftiges Ich trainiert heute mit dir.',
  'Nicht perfekt. Aber da. Das zählt.',
  'Disziplin ist, sich daran zu erinnern, was man wirklich will.',
  'Fortschritt ist leise. Bis er es nicht mehr ist.',
  'Du wirst nie bereuen, dass du trainiert hast.',
  'Ein Training mehr als letzte Woche ist ein Sieg.',
  'Stark sein beginnt mit einer Entscheidung: heute.',
  'Der Körper erreicht, woran der Kopf glaubt.',
  'Aufstehen, antreten, abhaken. Wiederholen.',
  'Rekorde entstehen in den Wochen, in denen keiner zuschaut.',
  'Deine einzige Konkurrenz ist dein Ich von letzter Woche.',
  'Müde ist okay. Aufgeben nicht.',
  'Gewohnheit ist stärker als Motivation.',
  'Jeder Satz zahlt auf dein Konto ein.',
  'Langsamer Fortschritt ist immer noch Fortschritt.',
  'Steig auf. Bleib stark.',
];

export interface RecapPR { exercise_name: string; weight_kg: number; reps: number }

export interface WeeklyRecapData {
  weekStart: Date; // Monday of the RECAPPED (last) week
  isoWeek: number;
  quote: string;
  workouts: number;
  target: number;
  prs: RecapPR[];
  avgSteps: number | null;
  avgSleepMin: number | null;
  coachMessage: string | null;
  nextWeekNo: number; // the client's personal training week number that starts now
}

export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function isoWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Key of the CURRENT week — the recap for last week is "seen" once per current week. */
const currentWeekKey = () => localDateKey(mondayOf(new Date()));

export function recapSeenThisWeek(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === currentWeekKey(); } catch { return true; }
}
export function markRecapSeen(): void {
  try { localStorage.setItem(SEEN_KEY, currentWeekKey()); } catch { /* ignore */ }
}

export async function loadWeeklyRecap(clientId: string, trainingsPerWeek: number): Promise<WeeklyRecapData | null> {
  const thisMonday = mondayOf(new Date());
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);

  const [wc, pr, hd, wm] = await Promise.all([
    supabase.from('workout_completions').select('completed_at').eq('client_id', clientId).order('completed_at', { ascending: true }),
    supabase.from('personal_records').select('exercise_name, weight_kg, reps, achieved_at').eq('client_id', clientId)
      .gte('achieved_at', lastMonday.toISOString()).lt('achieved_at', thisMonday.toISOString()),
    supabase.from('health_daily').select('day, steps, sleep_min').eq('client_id', clientId)
      .gte('day', localDateKey(lastMonday)).lt('day', localDateKey(thisMonday)),
    supabase.from('weekly_messages').select('body, created_at').eq('client_id', clientId).maybeSingle(),
  ]);

  const comps = (wc.data ?? []) as { completed_at: string }[];
  if (comps.length === 0 || new Date(comps[0].completed_at) >= thisMonday) return null; // nothing to look back on yet

  const workouts = comps.filter((c) => { const d = new Date(c.completed_at); return d >= lastMonday && d < thisMonday; }).length;

  // Best PR per exercise, heaviest first, max 5.
  const best = new Map<string, RecapPR>();
  for (const p of (pr.data ?? []) as RecapPR[]) {
    const cur = best.get(p.exercise_name);
    if (!cur || p.weight_kg > cur.weight_kg) best.set(p.exercise_name, p);
  }
  const prs = [...best.values()].sort((a, b) => b.weight_kg - a.weight_kg).slice(0, 5);

  const rows = (hd.data ?? []) as { steps: number | null; sleep_min: number | null }[];
  const avg = (vals: (number | null)[]) => { const v = vals.filter((x): x is number => x != null && x > 0); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };

  // Peter's line counts if he wrote/updated it since the recapped week began.
  const msg = wm.data as { body: string; created_at: string } | null;
  const coachMessage = msg && new Date(msg.created_at) >= lastMonday ? msg.body : null;

  const firstWeek = mondayOf(new Date(comps[0].completed_at));
  const nextWeekNo = Math.round((thisMonday.getTime() - firstWeek.getTime()) / (7 * 86400000)) + 1;
  const week = isoWeek(lastMonday);

  return {
    weekStart: lastMonday,
    isoWeek: week,
    quote: WEEKLY_QUOTES[week % WEEKLY_QUOTES.length],
    workouts,
    target: trainingsPerWeek,
    prs,
    avgSteps: avg(rows.map((r) => r.steps)),
    avgSleepMin: avg(rows.map((r) => r.sleep_min)),
    coachMessage,
    nextWeekNo,
  };
}

/** (Re)schedule the Monday 08:00 "Deine Woche ist da" notification. Native only. */
export async function scheduleWeeklyRecapNotification(): Promise<void> {
  if (Capacitor.getPlatform() === 'web') return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    await LocalNotifications.createChannel({ id: CHANNEL, name: t('Wochenrückblick'), description: t('Dein Rückblick jeden Montag'), importance: 3 }).catch(() => {});
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] }).catch(() => {});
    const at = mondayOf(new Date());
    at.setDate(at.getDate() + 7);
    at.setHours(8, 0, 0, 0);
    await LocalNotifications.schedule({
      notifications: [{ id: NOTIF_ID, title: t('Deine Woche ist da 💪'), body: t('Dein Wochenrückblick wartet — schau rein, bevor du loslegst.'), schedule: { at }, channelId: CHANNEL }],
    });
  } catch { /* permission revoked / unsupported */ }
}
