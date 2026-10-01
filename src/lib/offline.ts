import { supabase } from '@/lib/supabase';

// Offline training: the training screen keeps a per-user snapshot of the last good
// load (plan, history, PRs) so it opens without network, and a finished workout that
// can't be saved goes into an outbox (localStorage) that is flushed when the
// connection is back (app open, 'online', return to foreground).

export function isNetworkError(err: { message?: string } | null | undefined): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return !!err && /network request|failed to fetch|timed out|load failed/i.test(err.message ?? '');
}

// ── Snapshot cache ───────────────────────────────────────────────────────────
const cacheKey = (uid: string, key: string) => `adlr_cache_${uid}_${key}`;

export function cacheSet(uid: string, key: string, value: unknown): void {
  try { localStorage.setItem(cacheKey(uid, key), JSON.stringify(value)); } catch { /* quota — snapshot is best-effort */ }
}

export function cacheGet<T>(uid: string, key: string): T | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid, key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

// ── Outbox ───────────────────────────────────────────────────────────────────
export interface QueuedLog {
  exercise_name: string; set_number: number; weight_kg: number | null; reps: number | null;
  set_type: string; duration_sec: number | null; distance_km: number | null; plan_day_id: string | null;
}
export interface QueuedWorkout {
  localId: string;
  client_id: string;
  plan_day_id: string | null;
  completed_at: string;
  title: string | null;
  gym: string | null;
  duration_sec: number | null;
  logs: QueuedLog[];
  prs: { exercise_name: string; weight_kg: number; reps: number; gym: string | null }[];
  /** set once the completion row exists remotely, so a retry only sends the rest */
  remoteId?: string;
  logsSent?: boolean;
}

const OUTBOX = 'adlr_outbox';
const listeners = new Set<() => void>();

export function outbox(): QueuedWorkout[] {
  try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]') as QueuedWorkout[]; } catch { return []; }
}
function save(items: QueuedWorkout[]) {
  try { localStorage.setItem(OUTBOX, JSON.stringify(items)); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}
export function onOutboxChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function queueWorkout(w: QueuedWorkout): void {
  save([...outbox(), w]);
}

let flushing: Promise<number> | null = null;

/** Sends queued workouts in order; stops at the first network failure. Returns how many were sent. */
export function flushOutbox(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const item of outbox()) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      let id = item.remoteId;
      if (!id) {
        const row = { client_id: item.client_id, plan_day_id: item.plan_day_id, completed_at: item.completed_at };
        let res = await supabase.from('workout_completions')
          .insert({ ...row, title: item.title, gym: item.gym, duration_sec: item.duration_sec }).select('id').single();
        if (res.error && !isNetworkError(res.error)) res = await supabase.from('workout_completions').insert(row).select('id').single();
        if (res.error || !res.data) break;
        id = (res.data as { id: string }).id;
        save(outbox().map((x) => (x.localId === item.localId ? { ...x, remoteId: id } : x)));
      }
      if (item.logs.length > 0 && !item.logsSent) {
        const logs = item.logs.map((l) => ({ ...l, client_id: item.client_id, workout_completion_id: id, created_at: item.completed_at }));
        let { error } = await supabase.from('exercise_set_logs').insert(logs);
        if (error && !isNetworkError(error)) {
          ({ error } = await supabase.from('exercise_set_logs').insert(logs.map(({ set_type: _s, duration_sec: _d, distance_km: _k, ...r }) => r)));
        }
        if (error) break;
        save(outbox().map((x) => (x.localId === item.localId ? { ...x, logsSent: true } : x)));
      }
      if (item.prs.length > 0) {
        const rows = item.prs.map((p) => ({ ...p, client_id: item.client_id, achieved_at: item.completed_at }));
        const { error } = await supabase.from('personal_records').insert(rows);
        if (error && isNetworkError(error)) break;
        if (error) await supabase.from('personal_records').insert(rows.map(({ gym: _g, ...r }) => r));
      }
      save(outbox().filter((x) => x.localId !== item.localId));
      sent++;
    }
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}
