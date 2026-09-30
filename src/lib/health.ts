import { Capacitor } from '@capacitor/core';
import { Health, type HealthDataType } from '@capgo/capacitor-health';
import { supabase } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';

// Read-only health integration (Apple Health / Health Connect). Only these five types
// are requested — the Android manifest strips every other Health Connect permission
// the plugin would declare, so the Play health-permission review stays minimal.
export const HEALTH_TYPES: HealthDataType[] = ['steps', 'dietaryEnergyConsumed', 'sleep', 'weight', 'restingHeartRate'];

const ENABLED_KEY = 'adlr_health_enabled';
const LAST_SYNC_KEY = 'adlr_health_last_sync';
const SYNC_DAYS = 14;
const MIN_SYNC_GAP_MS = 30 * 60 * 1000;

export interface HealthDay {
  client_id: string;
  day: string; // YYYY-MM-DD
  steps: number | null;
  kcal_in: number | null;
  sleep_min: number | null;
  weight_kg: number | null;
  resting_hr: number | null;
}

export const healthPlatformName = () => (Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect');

export function isHealthEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; }
}
function setEnabled(on: boolean) {
  try { if (on) localStorage.setItem(ENABLED_KEY, '1'); else localStorage.removeItem(ENABLED_KEY); } catch { /* ignore */ }
}

export async function healthAvailability(): Promise<{ available: boolean; reason?: string }> {
  if (!Capacitor.isNativePlatform()) return { available: false, reason: 'Nur in der App auf dem Handy verfügbar.' };
  try {
    const r = await Health.isAvailable();
    return { available: r.available, reason: r.reason };
  } catch (e) {
    return { available: false, reason: String(e) };
  }
}

/** Opens the native permission sheet; returns true if at least one type was granted. */
export async function connectHealth(): Promise<boolean> {
  const status = await Health.requestAuthorization({ read: HEALTH_TYPES, write: [] });
  const ok = status.readAuthorized.length > 0;
  setEnabled(ok);
  return ok;
}

export function disconnectHealth() {
  setEnabled(false);
}

export async function openHealthSettings() {
  try { await Health.openHealthConnectSettings(); } catch { /* iOS: no-op */ }
}

const dayKey = (iso: string) => localDateKey(iso);

async function dailySums(dataType: HealthDataType, start: Date, end: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const { samples } = await Health.queryAggregated({ dataType, startDate: start.toISOString(), endDate: end.toISOString(), bucket: 'day', aggregation: 'sum' });
    for (const s of samples) out.set(dayKey(s.startDate), s.value);
  } catch { /* not granted / unsupported → leave empty */ }
  return out;
}

async function samplesByDay(dataType: HealthDataType, start: Date, end: Date) {
  try {
    const { samples } = await Health.readSamples({ dataType, startDate: start.toISOString(), endDate: end.toISOString(), limit: 1000, ascending: true });
    return samples;
  } catch {
    return [];
  }
}

/**
 * Pulls the last SYNC_DAYS days and upserts one row per day into `health_daily`,
 * so the trainer sees it too. Throttled; safe to call on every app open.
 */
export async function syncHealth(clientId: string, force = false): Promise<boolean> {
  if (!isHealthEnabled() || !Capacitor.isNativePlatform()) return false;
  try {
    const last = Number(localStorage.getItem(LAST_SYNC_KEY) ?? 0);
    if (!force && Date.now() - last < MIN_SYNC_GAP_MS) return false;
  } catch { /* ignore */ }

  const end = new Date();
  const start = new Date(); start.setDate(start.getDate() - (SYNC_DAYS - 1)); start.setHours(0, 0, 0, 0);

  const [steps, kcal, sleep, weight, rhr] = await Promise.all([
    dailySums('steps', start, end),
    dailySums('dietaryEnergyConsumed', start, end),
    samplesByDay('sleep', new Date(start.getTime() - 12 * 3600000), end),
    samplesByDay('weight', start, end),
    samplesByDay('restingHeartRate', start, end),
  ]);

  // Sleep: count "asleep"-type minutes, attributed to the day the session ENDS (wake-up day).
  const sleepMin = new Map<string, number>();
  for (const s of sleep) {
    const minutes = s.stages?.length
      ? s.stages.filter((st) => st.stage !== 'awake' && st.stage !== 'inBed').reduce((t, st) => t + st.durationMinutes, 0)
      : (s.sleepState === 'awake' || s.sleepState === 'inBed' ? 0 : s.value);
    const k = dayKey(s.endDate);
    sleepMin.set(k, (sleepMin.get(k) ?? 0) + minutes);
  }
  const lastOfDay = (samples: { startDate: string; value: number }[]) => {
    const m = new Map<string, number>();
    for (const s of samples) m.set(dayKey(s.startDate), s.value); // ascending → last wins
    return m;
  };
  const weightByDay = lastOfDay(weight);
  const rhrByDay = lastOfDay(rhr);

  const rows: HealthDay[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = localDateKey(d);
    const row: HealthDay = {
      client_id: clientId,
      day: k,
      steps: steps.has(k) ? Math.round(steps.get(k)!) : null,
      kcal_in: kcal.has(k) ? Math.round(kcal.get(k)!) : null,
      sleep_min: sleepMin.has(k) ? Math.round(sleepMin.get(k)!) : null,
      weight_kg: weightByDay.has(k) ? Math.round(weightByDay.get(k)! * 10) / 10 : null,
      resting_hr: rhrByDay.has(k) ? Math.round(rhrByDay.get(k)!) : null,
    };
    if (row.steps != null || row.kcal_in != null || row.sleep_min != null || row.weight_kg != null || row.resting_hr != null) rows.push(row);
  }
  if (rows.length > 0) {
    const { error } = await supabase.from('health_daily').upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'client_id,day' });
    if (error) return false;
  }
  try { localStorage.setItem(LAST_SYNC_KEY, String(Date.now())); } catch { /* ignore */ }
  return true;
}
