import { useSyncExternalStore } from 'react';
import en from '@/i18n/en';
import hu from '@/i18n/hu';
import { EXERCISE_EN, EXERCISE_HU } from '@/i18n/exercises';

// Lightweight gettext-style i18n: German is the source language and the lookup key,
// so untranslated strings gracefully fall back to German. `t()` reads the current
// language at call time — keep constants in German and call t() when rendering.

export type Lang = 'de' | 'en' | 'hu';

export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: 'de', label: 'Deutsch', short: 'DE' },
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'hu', label: 'Magyar', short: 'HU' },
];

const KEY = 'adlr_lang';
const LOCALES: Record<Lang, string> = { de: 'de-AT', en: 'en-GB', hu: 'hu-HU' };
const DICTS: Record<Lang, Record<string, string> | null> = {
  de: null,
  en: { ...EXERCISE_EN, ...en },
  hu: { ...EXERCISE_HU, ...hu },
};

function isLang(v: unknown): v is Lang {
  return v === 'de' || v === 'en' || v === 'hu';
}

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch { /* ignore */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'de').slice(0, 2).toLowerCase();
  if (nav === 'hu') return 'hu';
  if (nav === 'de') return 'de';
  return 'en';
}

let current: Lang = detect();
const listeners = new Set<() => void>();
const missing = new Set<string>();

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((fn) => fn());
}

/** Re-renders the caller when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => current,
    () => current,
  );
}

/**
 * Translate a German source string. `{name}` placeholders are filled from `vars`.
 * A `ctx|` prefix disambiguates identical German words with different meanings
 * (e.g. `exp|Mittel`); the prefix is stripped when falling back to German.
 */
export function t(de: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[current];
  const ctx = /^[a-z]+\|/.exec(de);
  let out = ctx ? de.slice(ctx[0].length) : de;
  if (dict) {
    const hit = dict[de];
    if (hit !== undefined) out = hit;
    else if (import.meta.env.DEV && de && !missing.has(de)) {
      missing.add(de);
      console.warn(`[i18n:${current}] missing:`, de);
    }
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return out;
}

/** BCP-47 locale for dates/numbers in the current language. */
export function locale(): string {
  return LOCALES[current];
}

export function fmtDate(d: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleDateString(locale(), opts);
}

export function fmtTime(d: Date | string | number, opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }): string {
  return new Date(d).toLocaleTimeString(locale(), opts);
}

export function fmtNum(n: number, opts?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(locale(), opts);
}

/** Apply the saved/detected language to <html lang> before React renders. */
export function initLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
