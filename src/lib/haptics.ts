import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

// Haptics only fire on a real device. On web everything is a safe no-op.
const isNative = Capacitor.isNativePlatform();

export const haptic = {
  light: () => { if (isNative) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); },
  medium: () => { if (isNative) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}); },
  success: () => { if (isNative) Haptics.notification({ type: NotificationType.Success }).catch(() => {}); },
  warning: () => { if (isNative) Haptics.notification({ type: NotificationType.Warning }).catch(() => {}); },
};

// One global listener gives every button / nav item / .adlr-tap element a subtle
// tactile tick on press — no need to wire each handler individually.
let installed = false;
export function installGlobalTapHaptics() {
  if (installed || !isNative || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.('button, a, [role="button"], .adlr-tap') as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
      haptic.light();
    },
    { passive: true, capture: true }
  );
}
