import { Haptics, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

// End-of-rest alarm while the app is open: three short beeps + vibration.
// (In the background the native lock-screen flow alerts instead — see restChrono.ts.)
// The sound follows the phone's silent switch / volume; vibration works either way.

let ctx: AudioContext | null = null;

/** Call from a tap (e.g. ticking a set): browsers only allow audio after a user gesture. */
export function unlockRestAlarm(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* no audio */ }
}

function beep(at: number, freq: number, dur: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function playRestAlarm(): void {
  try {
    unlockRestAlarm();
    if (ctx) {
      const t0 = ctx.currentTime + 0.02;
      beep(t0, 880, 0.16);
      beep(t0 + 0.24, 880, 0.16);
      beep(t0 + 0.48, 1175, 0.32);
    }
  } catch { /* no audio */ }
  if (Capacitor.isNativePlatform()) {
    Haptics.vibrate({ duration: 500 }).catch(() => {});
    setTimeout(() => Haptics.notification({ type: NotificationType.Warning }).catch(() => {}), 600);
  } else {
    try { navigator.vibrate?.([300, 120, 300]); } catch { /* unsupported */ }
  }
}
