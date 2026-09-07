export type Theme = 'obsidian' | 'espresso' | 'elfenbein';

export const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: 'obsidian', label: 'Obsidian', hint: 'Dunkel · Standard' },
  { id: 'espresso', label: 'Espresso', hint: 'Warm · Dunkel' },
  { id: 'elfenbein', label: 'Elfenbein', hint: 'Hell' },
];

const KEY = 'adlr_theme';
const DEFAULT: Theme = 'obsidian';

function isTheme(v: unknown): v is Theme {
  return v === 'obsidian' || v === 'espresso' || v === 'elfenbein';
}

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (isTheme(t)) return t;
  } catch { /* ignore */ }
  return DEFAULT;
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute('data-theme', t);
}

export function setTheme(t: Theme): void {
  applyTheme(t);
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}

/** Apply the saved theme as early as possible (call before React renders). */
export function initTheme(): void {
  applyTheme(getTheme());
}
