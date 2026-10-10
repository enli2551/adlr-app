import { registerPlugin, Capacitor } from '@capacitor/core';
import { t } from '@/lib/i18n';

/**
 * Lock-screen workout flow: a live notification (Android) / Live Activity (iOS) that shows
 * the rest countdown and, when it's over, the next set with a ✓ button — so sets can be
 * ticked off without opening the app.
 *
 * The native side owns the flow while the phone is locked (JS may be asleep): it gets the
 * queue of upcoming sets, switches rest → set at the end of the rest (buzz + sound), and on
 * ✓ starts the next rest itself. Every tap is stored natively and handed back to JS via
 * `drain()` (the `restAction` event just says "something happened").
 * Native: android/.../RestFlow.java, ios/App/App/RestTimerShared.swift. Web = no-op.
 */
export interface RestStep {
  /** set key in the training screen ("<exercise>#<index>") — echoed back when ticked */
  key: string;
  /** exercise name (translated) */
  title: string;
  /** e.g. "Satz 2/4 · 80 kg × 8" */
  body: string;
  /** rest in seconds after this set (0 = none) */
  rest: number;
}

export type RestEvent =
  | { type: 'done'; key: string; at: number }
  | { type: 'adjust'; at: number };

export interface RestFlowState {
  phase: 'rest' | 'set' | 'done' | 'none';
  endTime: number;
}

interface RestChronoPlugin {
  start(options: { endTime: number; steps: RestStep[]; labels: Record<string, string> }): Promise<void>;
  stop(): Promise<void>;
  drain(): Promise<{ events: RestEvent[]; phase: RestFlowState['phase']; endTime: number }>;
  setForeground(options: { value: boolean }): Promise<void>;
  addListener(eventName: 'restAction', listener: (data: { action: string }) => void): Promise<{ remove: () => void }>;
}

const RestChrono = registerPlugin<RestChronoPlugin>('RestChrono');

const isNative = (): boolean => {
  try {
    return Capacitor.getPlatform() !== 'web';
  } catch {
    return false;
  }
};

const labels = () => ({
  rest: t('Pause'),
  next: t('Als Nächstes'),
  now: t('Jetzt dran'),
  done: t('✓ Erledigt'),
  finished: t('Alle Sätze erledigt 💪'),
  finishedBody: t('Öffne ADLR, um das Training zu beenden.'),
  alert: t('Pause vorbei!'),
  channel: t('Pausen-Ende'),
});

/** Show/replace the lock-screen flow. `endTime` <= now starts directly with the next set. */
export async function startRestFlow(endTime: number, steps: RestStep[]): Promise<void> {
  if (!isNative()) return;
  try {
    await RestChrono.start({ endTime, steps: steps.slice(0, 60), labels: labels() });
  } catch {
    /* plugin unavailable or notifications not permitted */
  }
}

export async function stopRestFlow(): Promise<void> {
  if (!isNative()) return;
  try {
    await RestChrono.stop();
  } catch {
    /* ignore */
  }
}

/** Taps made on the lock screen since the last call, plus the native flow's current phase. */
export async function drainRestFlow(): Promise<{ events: RestEvent[]; state: RestFlowState }> {
  if (!isNative()) return { events: [], state: { phase: 'none', endTime: 0 } };
  try {
    const r = await RestChrono.drain();
    return { events: r.events ?? [], state: { phase: r.phase ?? 'none', endTime: r.endTime ?? 0 } };
  } catch {
    return { events: [], state: { phase: 'none', endTime: 0 } };
  }
}

/** While the app is open it beeps itself — the native end-of-rest alert only fires in the background. */
export async function setRestFlowForeground(value: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    await RestChrono.setForeground({ value });
  } catch {
    /* ignore */
  }
}

let listener: { remove: () => void } | null = null;

export async function onRestFlowAction(handler: () => void): Promise<void> {
  if (!isNative()) return;
  removeRestFlowListener();
  try {
    listener = await RestChrono.addListener('restAction', () => handler());
  } catch {
    /* ignore */
  }
}

export function removeRestFlowListener(): void {
  try {
    listener?.remove();
  } catch {
    /* ignore */
  }
  listener = null;
}
