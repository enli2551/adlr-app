import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * Live rest countdown shown as an ongoing notification with a native ticking
 * chronometer (counts down to `endTime` on the lock screen without the app running).
 * Backed by the custom Android RestChrono plugin (see android/.../RestChronoPlugin.java).
 * On web / non-native platforms every call is a no-op.
 */
export interface RestChronoPlugin {
  start(options: { endTime: number; title: string; body: string; ongoing?: boolean }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'restAction',
    listener: (data: { action: 'done' | 'add_30s' }) => void,
  ): Promise<{ remove: () => void }>;
}

const RestChrono = registerPlugin<RestChronoPlugin>('RestChrono');

const isNative = (): boolean => {
  try {
    return Capacitor.getPlatform() !== 'web';
  } catch {
    return false;
  }
};

export interface StartRestChronoOptions {
  /** Epoch millis when the rest ends. */
  endTime: number;
  title: string;
  body: string;
  ongoing?: boolean;
}

export async function startRestChrono(opts: StartRestChronoOptions): Promise<void> {
  if (!isNative()) return;
  try {
    await RestChrono.start({ ongoing: true, ...opts });
  } catch {
    /* plugin unavailable or notifications not permitted */
  }
}

export async function stopRestChrono(): Promise<void> {
  if (!isNative()) return;
  try {
    await RestChrono.stop();
  } catch {
    /* ignore */
  }
}

let chronoListener: { remove: () => void } | null = null;

export async function registerRestChronoActionListener(
  handler: (action: 'done' | 'add_30s') => void,
): Promise<void> {
  if (!isNative() || chronoListener) return;
  try {
    chronoListener = await RestChrono.addListener('restAction', (data) => handler(data.action));
  } catch {
    /* ignore */
  }
}

export async function removeRestChronoActionListener(): Promise<void> {
  try {
    chronoListener?.remove();
  } catch {
    /* ignore */
  }
  chronoListener = null;
}
