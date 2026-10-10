import { supabase } from '@/lib/supabase';
import { captureError } from '@/lib/monitoring';

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

/** Random UUID v4 — row ids are generated on the device so a retried upload can't create duplicates. */
export function uuid(): string {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch { /* insecure context */ }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const isDuplicate = (err: { code?: string } | null | undefined) => err?.code === '23505';

// ── Outbox ───────────────────────────────────────────────────────────────────
// Every finished workout goes through here (online too): it's written to the device
// first, then uploaded. A connection drop or the phone being locked mid-save used to
// leave a completion row without its duration and sets.
export interface QueuedLog {
  id?: string;
  exercise_name: string; set_number: number; weight_kg: number | null; reps: number | null;
  set_type: string; duration_sec: number | null; distance_km: number | null; plan_day_id: string | null;
}
export interface QueuedWorkout {
  localId: string;
  /** completion row id, generated on the device (older queued items don't have one) */
  id?: string;
  client_id: string;
  plan_day_id: string | null;
  completed_at: string;
  title: string | null;
  gym: string | null;
  duration_sec: number | null;
  exercise_notes?: Record<string, string> | null;
  logs: QueuedLog[];
  prs: { exercise_name: string; weight_kg: number; reps: number; gym: string | null }[];
  /** set once the completion row exists remotely, so a retry only sends the rest */
  remoteId?: string;
  logsSent?: boolean;
  /** last server-side (non-network) error — shown to the user, retried on the next flush */
  lastError?: string;
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
    const fail = (item: QueuedWorkout, err: { message?: string }) => {
      captureError(err, { where: 'flushOutbox' });
      save(outbox().map((x) => (x.localId === item.localId ? { ...x, lastError: err.message ?? 'error' } : x)));
    };
    for (const item of outbox()) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      let id = item.remoteId;
      if (!id) {
        const row = { ...(item.id ? { id: item.id } : {}), client_id: item.client_id, plan_day_id: item.plan_day_id, completed_at: item.completed_at };
        // Newest columns first; fall back step by step if a migration hasn't been run yet.
        const attempts = [
          { ...row, title: item.title, gym: item.gym, duration_sec: item.duration_sec, exercise_notes: item.exercise_notes ?? null },
          { ...row, title: item.title, gym: item.gym, duration_sec: item.duration_sec },
          row,
        ];
        let lastErr: { message?: string; code?: string } | null = null;
        for (const attempt of attempts) {
          const res = await supabase.from('workout_completions').insert(attempt).select('id').single();
          if (!res.error && res.data) { id = (res.data as { id: string }).id; break; }
          // Stored on an earlier try whose response got lost — same id, so it's ours.
          if (item.id && isDuplicate(res.error)) { id = item.id; break; }
          lastErr = res.error;
          if (isNetworkError(res.error)) break;
        }
        if (!id) {
          if (lastErr && !isNetworkError(lastErr)) fail(item, lastErr);
          break;
        }
        save(outbox().map((x) => (x.localId === item.localId ? { ...x, remoteId: id } : x)));
      }
      if (item.logs.length > 0 && !item.logsSent) {
        const logs = item.logs.map((l) => ({ ...l, client_id: item.client_id, workout_completion_id: id, created_at: item.completed_at }));
        let { error } = await supabase.from('exercise_set_logs').insert(logs);
        if (error && !isNetworkError(error) && !isDuplicate(error)) {
          ({ error } = await supabase.from('exercise_set_logs').insert(logs.map(({ set_type: _s, duration_sec: _d, distance_km: _k, ...r }) => r)));
        }
        // One insert is atomic: a duplicate id means the whole batch already arrived.
        if (error && !isDuplicate(error)) {
          if (!isNetworkError(error)) fail(item, error);
          break;
        }
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
