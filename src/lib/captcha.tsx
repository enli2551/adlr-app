import { useCallback, useEffect, useRef, useState } from 'react';
import { getLang } from '@/lib/i18n';

// Bot protection for sign-up, login and password reset: Cloudflare Turnstile, checked by
// Supabase Auth (Dashboard → Authentication → Attack Protection → CAPTCHA, provider Turnstile,
// with the SECRET key there). The site key below is public.
//
// ORDER MATTERS: release a build that has the site key FIRST, let people update, THEN switch
// CAPTCHA on in Supabase — otherwise every older app version can no longer log in.
// Empty site key = no widget, auth calls without a token (CAPTCHA off).
export const TURNSTILE_SITE_KEY = '';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

let loader: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loader = null; reject(new Error('turnstile load failed')); };
    document.head.appendChild(s);
  });
  return loader;
}

/** One Turnstile widget. `token` is single-use: call `reset()` after every auth request. */
export function useCaptcha() {
  const enabled = TURNSTILE_SITE_KEY !== '';
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadTurnstile().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widget.current = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (tok: string) => { setToken(tok); setFailed(false); },
        'expired-callback': () => setToken(null),
        'error-callback': () => { setToken(null); setFailed(true); },
        theme: document.documentElement.classList.contains('light') ? 'light' : 'dark',
        size: 'flexible',
        language: getLang(),
      });
    }).catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [enabled]);

  const reset = useCallback(() => {
    setToken(null);
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, []);

  return {
    enabled,
    /** pass to Supabase as captchaToken (undefined when CAPTCHA is off) */
    token: token ?? undefined,
    /** true when an auth request may be sent */
    ready: !enabled || !!token,
    failed,
    reset,
    element: enabled ? <div ref={ref} className="my-3 min-h-[65px] flex justify-center" /> : null,
  };
}
