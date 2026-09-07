import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export interface SessionLite {
  id: string;
  scheduled_at: string;
  location: string;
  duration_min: number;
}

const CHANNEL = 'session-reminders';
const ID_BASE = 900000; // reserved local-notification id range for session reminders

const isNative = (): boolean => {
  try {
    return Capacitor.getPlatform() !== 'web';
  } catch {
    return false;
  }
};

function hashInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function notifId(sessionId: string, tag: 0 | 1): number {
  return ID_BASE + (hashInt(sessionId) % 40000) * 2 + tag;
}

/**
 * Keep the client's local reminder notifications in sync with their upcoming
 * sessions: an evening-before heads-up and a 1-hour-before reminder. Cancels any
 * previously scheduled session reminders first so re-runs don't duplicate.
 * No-op on web or without notification permission (the rest-timer flow prompts).
 */
export async function syncSessionReminders(sessions: SessionLite[]): Promise<void> {
  if (!isNative()) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
  } catch {
    return;
  }
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: 'Termin-Erinnerungen',
      description: 'Erinnerungen an geplante Trainings-Sessions',
      importance: 4,
    });
  } catch { /* channel may already exist */ }

  // Clear our previously scheduled reminders (ids in the reserved range).
  try {
    const pending = await LocalNotifications.getPending();
    const ours = (pending.notifications ?? []).filter((n) => n.id >= ID_BASE).map((n) => ({ id: n.id }));
    if (ours.length) await LocalNotifications.cancel({ notifications: ours });
  } catch { /* ignore */ }

  const now = Date.now();
  const toSchedule: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [];
  for (const s of sessions) {
    const at = new Date(s.scheduled_at).getTime();
    if (Number.isNaN(at)) continue;
    const timeStr = new Date(s.scheduled_at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });

    const oneH = at - 60 * 60 * 1000;
    if (oneH > now) {
      toSchedule.push({
        id: notifId(s.id, 1),
        title: 'Training in 1 Stunde',
        body: `${timeStr} · ${s.location} (${s.duration_min} Min)`,
        schedule: { at: new Date(oneH) },
        channelId: CHANNEL,
      });
    }

    const day = new Date(s.scheduled_at);
    const evening = new Date(day);
    evening.setDate(day.getDate() - 1);
    evening.setHours(19, 0, 0, 0);
    if (evening.getTime() > now && evening.getTime() < at) {
      toSchedule.push({
        id: notifId(s.id, 0),
        title: 'Termin morgen',
        body: `${day.toLocaleDateString('de-AT', { weekday: 'long' })} ${timeStr} · ${s.location}`,
        schedule: { at: evening },
        channelId: CHANNEL,
      });
    }
  }

  if (toSchedule.length) {
    try {
      await LocalNotifications.schedule({ notifications: toSchedule });
    } catch { /* scheduling can fail if permission revoked mid-session */ }
  }
}
