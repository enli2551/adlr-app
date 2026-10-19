import { Capacitor, registerPlugin } from '@capacitor/core';
import { PushNotifications, type ActionPerformed, type Token } from '@capacitor/push-notifications';
import { supabase } from '@/lib/supabase';
import { getLang, t } from '@/lib/i18n';

/**
 * Remote push (chat, check-ins, sessions). Server side: migration 20261017_push.sql +
 * Edge Function send-push. Android gets an FCM token, iOS a raw APNs token.
 *
 * Android without google-services.json at build time has no FirebaseApp, and register()
 * would throw natively — so on Android we only register when the native PushSupport
 * check says the Firebase config was bundled. Everything here is best-effort and silent.
 */
const TOKEN_KEY = 'adlr_push_token';
const ASKED_KEY = 'adlr_push_asked';
const CHANNEL = 'adlr-push'; // same id as send-push's android.notification.channel_id

const PushSupport = registerPlugin<{ isAvailable(): Promise<{ available: boolean }> }>('PushSupport');

let listenersReady = false;
let registeredFor: string | null = null;

function platform(): 'android' | 'ios' | null {
  try {
    const p = Capacitor.getPlatform();
    return p === 'android' || p === 'ios' ? p : null;
  } catch { return null; }
}

async function pushAvailable(): Promise<boolean> {
  const p = platform();
  if (!p || !Capacitor.isPluginAvailable('PushNotifications')) return false;
  if (p === 'ios') return true;
  try { return (await PushSupport.isAvailable()).available === true; } catch { return false; }
}

function store(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* ignore */ }
}
function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** In-app path from a tapped notification (`data.link`), only our own routes. */
export function linkFromAction(action: ActionPerformed): string | null {
  const link = (action?.notification?.data as Record<string, unknown> | undefined)?.link;
  return typeof link === 'string' && /^\/(app|trainer)(\/|\?|$)/.test(link) ? link : null;
}

/**
 * Tap handling — install once at app start (before login is known): a tap that cold-starts
 * the app is retained by the plugin until this listener exists.
 */
export async function listenForPushTaps(onLink: (link: string) => void): Promise<() => void> {
  if (!(await pushAvailable())) return () => {};
  try {
    const h = await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const link = linkFromAction(a);
      if (link) onLink(link);
    });
    return () => { h.remove().catch(() => {}); };
  } catch { return () => {}; }
}

async function saveToken(token: string, userId: string) {
  const p = platform();
  if (!p) return;
  store(TOKEN_KEY, token);
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: p });
  if (error) console.warn('push token', error.message); // migration not run yet → harmless
  // Recipient language for the localized push text (clients sync it in ClientLayout too).
  supabase.from('profiles').update({ lang: getLang() }).eq('id', userId).then(() => {}, () => {});
}

/**
 * Called once the user is logged in and inside the app. Asks for permission only once per
 * device (later starts just refresh the token if it was granted), then registers.
 */
export async function ensurePush(userId: string): Promise<void> {
  if (registeredFor === userId || !(await pushAvailable())) return;
  try {
    let perm = (await PushNotifications.checkPermissions()).receive;
    if (perm === 'prompt' || perm === 'prompt-with-rationale') {
      if (read(ASKED_KEY)) return;
      store(ASKED_KEY, '1');
      perm = (await PushNotifications.requestPermissions()).receive;
    }
    if (perm !== 'granted') return;
    registeredFor = userId;

    if (!listenersReady) {
      listenersReady = true;
      await PushNotifications.addListener('registration', (tk: Token) => {
        if (registeredFor) saveToken(tk.value, registeredFor).catch(() => {});
      });
      await PushNotifications.addListener('registrationError', (e) => console.warn('push register', e.error));
    }
    if (platform() === 'android') {
      await PushNotifications.createChannel({
        id: CHANNEL, name: t('Nachrichten & Termine'), description: t('Chat, Check-ins und Termine von deinem Coach'),
        importance: 4, visibility: 1,
      }).catch(() => {});
    }
    await PushNotifications.register();
  } catch (e) {
    registeredFor = null;
    console.warn('push', e);
  }
}

/** Logout: stop pushes to this device for the account (best-effort, never blocks logout). */
export async function removePushToken(): Promise<void> {
  registeredFor = null;
  const token = read(TOKEN_KEY);
  if (!token) return;
  store(TOKEN_KEY, null);
  try {
    await Promise.race([
      supabase.from('push_tokens').delete().eq('token', token),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch { /* ignore */ }
}
