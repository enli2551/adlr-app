import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { t } from '@/lib/i18n';

const REST_TIMER_NOTIF_ID = 8001;
const REST_TIMER_CHANNEL_ID = 'rest-timer-alert';
const ACTION_START_NEXT = 'START_NEXT_SET';
const ACTION_ADD_30 = 'ADD_30S';

const STORAGE_KEY = 'adlr_rest_timer_state';

export interface RestTimerState {
  exerciseName: string;
  setNumber: number;
  totalSets: number;
  restSeconds: number;
  startedAt: number;
  isLastSet: boolean;
  isWorkoutComplete: boolean;
  reps?: string;
}

let permissionPrompted = false;

const isNative = (): boolean => {
  try {
    return Capacitor.getPlatform() !== 'web';
  } catch {
    return false;
  }
};

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    if (current.display === 'prompt' || current.display === 'prompt-with-rationale') {
      if (!permissionPrompted) {
        permissionPrompted = true;
        const result = await LocalNotifications.requestPermissions();
        return result.display === 'granted';
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function hasPromptedPermission(): boolean {
  return permissionPrompted;
}

export async function isNotificationPermissionGranted(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    return display === 'granted';
  } catch {
    return false;
  }
}

function persistState(state: RestTimerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

export function clearPersistedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

export function getPersistedState(): RestTimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RestTimerState;
  } catch {
    return null;
  }
}

export interface ScheduleOptions {
  exerciseName: string;
  setNumber: number;
  totalSets: number;
  restSeconds: number;
  isLastSet: boolean;
  isWorkoutComplete: boolean;
  delaySeconds?: number;
  reps?: string;
}

export async function scheduleRestTimerNotification(opts: ScheduleOptions): Promise<void> {
  if (!isNative()) return;
  const granted = await isNotificationPermissionGranted();
  if (!granted) return;

  await cancelRestTimerNotification();

  const delay = (opts.delaySeconds ?? opts.restSeconds);
  const fireAt = new Date(Date.now() + delay * 1000);

  const state: RestTimerState = {
    exerciseName: opts.exerciseName,
    setNumber: opts.setNumber,
    totalSets: opts.totalSets,
    restSeconds: opts.restSeconds,
    startedAt: Date.now(),
    isLastSet: opts.isLastSet,
    isWorkoutComplete: opts.isWorkoutComplete,
    reps: opts.reps,
  };
  persistState(state);

  const repsSuffix = opts.reps ? ` · ${opts.reps} ${t('Wdh.')}` : '';

  let title: string;
  let body: string;

  if (opts.isWorkoutComplete) {
    title = t('Training abgeschlossen!');
    body = t('Alle Übungen erledigt — stark! 🎉');
  } else if (opts.isLastSet) {
    title = t('Pause vorbei — letzter Satz!');
    body = `${t(opts.exerciseName)} — ${t('Satz {n}/{total}', { n: opts.setNumber, total: opts.totalSets })}${repsSuffix}`;
  } else {
    title = t('Pause vorbei — nächster Satz!');
    body = `${t(opts.exerciseName)} — ${t('Satz {n}/{total}', { n: opts.setNumber, total: opts.totalSets })}${repsSuffix}`;
  }

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_TIMER_NOTIF_ID,
          title,
          body,
          schedule: { at: fireAt },
          channelId: REST_TIMER_CHANNEL_ID,
          actionTypeId: 'REST_TIMER_ACTIONS',
          extra: { actionStartNext: ACTION_START_NEXT, actionAdd30: ACTION_ADD_30 },
        },
      ],
    });
  } catch { /* scheduling can fail if permissions revoked mid-session */ }
}

export async function cancelRestTimerNotification(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REST_TIMER_NOTIF_ID }] });
  } catch { /* ignore */ }
}

export async function snoozeRestTimerNotification(extraSeconds = 30): Promise<void> {
  const state = getPersistedState();
  if (!state) return;
  await scheduleRestTimerNotification({
    exerciseName: state.exerciseName,
    setNumber: state.setNumber,
    totalSets: state.totalSets,
    restSeconds: state.restSeconds,
    isLastSet: state.isLastSet,
    isWorkoutComplete: state.isWorkoutComplete,
    delaySeconds: extraSeconds,
  });
}

export type RestTimerActionHandler = (action: 'start_next' | 'add_30s') => void;

let listenerRegistered = false;
let actionHandler: RestTimerActionHandler | null = null;

export function setRestTimerActionHandler(handler: RestTimerActionHandler | null): void {
  actionHandler = handler;
}

export async function registerRestTimerActionListener(): Promise<void> {
  if (!isNative() || listenerRegistered) return;
  listenerRegistered = true;

  try {
    // A fresh channel id, not "rest-timer": on devices that ran an earlier build, the
    // native RestChrono plugin used to create a channel with that exact id at LOW
    // importance (it loads before this JS code ever runs), and Android permanently
    // locks a channel's importance at first creation — reusing that id here would
    // silently inherit the LOW importance forever. A new id guarantees this alert
    // channel actually gets created at HIGH importance on every device.
    await LocalNotifications.createChannel({
      id: REST_TIMER_CHANNEL_ID,
      name: t('Trainings-Pausen-Timer'),
      description: t('Benachrichtigungen für Pausen zwischen Sätzen'),
      importance: 4,
      visibility: 1,
      sound: 'rest_done.wav',
    });
  } catch { /* channel may already exist */ }

  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'REST_TIMER_ACTIONS',
          actions: [
            { id: ACTION_START_NEXT, title: t('Nächster Satz'), destructive: false, foreground: false },
            { id: ACTION_ADD_30, title: '+30s', destructive: false, foreground: false },
          ],
        },
      ],
    });
  } catch { /* ignore on platforms that don't support action types */ }

  try {
    await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const actionId = event.actionId;
      if (actionId === ACTION_START_NEXT) {
        actionHandler?.('start_next');
      } else if (actionId === ACTION_ADD_30) {
        actionHandler?.('add_30s');
      }
    });
  } catch { /* ignore if listener fails */ }
}

export async function removeAllListeners(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.removeAllListeners();
  } catch { /* ignore */ }
  listenerRegistered = false;
}
