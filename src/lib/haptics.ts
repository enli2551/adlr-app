import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

// Haptics only fire on a real device. On web everything is a safe no-op.
// Used sparingly, like the platform guidelines (Apple HIG / Material) recommend: only for
// meaningful moments — a set ticked off, a workout started/finished, something saved, the
// rest alarm — never on every button press (that buzzed constantly and users complained).
// Users can switch them off in Profil (the rest alarm still vibrates: it's an alarm).
const isNative = Capacitor.isNativePlatform();
const KEY = 'adlr_haptics';

export function hapticsEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setHapticsEnabled(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}

const on = () => isNative && hapticsEnabled();

export const haptic = {
  light: () => { if (on()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); },
  medium: () => { if (on()) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}); },
  success: () => { if (on()) Haptics.notification({ type: NotificationType.Success }).catch(() => {}); },
  warning: () => { if (on()) Haptics.notification({ type: NotificationType.Warning }).catch(() => {}); },
};
