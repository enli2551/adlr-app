import { Capacitor } from '@capacitor/core';
import { t } from '@/lib/i18n';

// Public sign-up page that understands ?code= (the web build's /auth route). There is no
// hosted web app yet — until VITE_INVITE_URL is set, coaches share the code as text only.
const INVITE_URL = (import.meta.env.VITE_INVITE_URL as string | undefined)?.trim() || null;

/** Sign-up link with the coach's code prefilled, or null when no public URL is configured. */
export function inviteLink(code: string): string | null {
  if (!INVITE_URL) return null;
  return `${INVITE_URL}${INVITE_URL.includes('?') ? '&' : '?'}code=${encodeURIComponent(code)}`;
}

export function inviteText(code: string): string {
  const link = inviteLink(code);
  const text = t('Trainiere mit mir in der ADLR-App! Lade die App herunter und gib beim Registrieren meinen Code ein: {code}', { code });
  return link ? `${text}\n${link}` : text;
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Native share sheet on iOS/Android, Web Share in browsers, clipboard as last resort. */
export async function shareInvite(code: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const text = inviteText(code);
  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'ADLR', text, dialogTitle: t('Klienten einladen') });
      return 'shared';
    }
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    if (nav.share) { await nav.share({ title: 'ADLR', text }); return 'shared'; }
  } catch (e) {
    if (e instanceof Error && /cancel|abort/i.test(e.message + e.name)) return 'cancelled';
  }
  return (await copyText(text)) ? 'copied' : 'cancelled';
}
