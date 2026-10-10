// Coach branding: the coach's logo + main colour replace ADLR gold in their clients' app
// (and in the coach's own app, so they see what clients see). The whole UI takes the accent
// from the CSS variables --adlr-gold / --adlr-gold-dim, so overriding them on <html> is enough.
// Cached per device so the colour is there on the next start before anything has loaded.

const CACHE_KEY = 'adlr_brand';

export interface Brand { color: string | null; logo: string | null }

/** Preset accents that keep black button text readable on every theme. */
export const BRAND_PRESETS = ['#C9A84C', '#D4AF37', '#E07A5F', '#E63946', '#F4A261', '#2A9D8F', '#4CC9F0', '#8AB4F8', '#9B5DE5', '#80B918', '#B5B5B5'];

const HEX = /^#[0-9a-f]{6}$/i;

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

const mix = (c: [number, number, number], to: number, f: number): [number, number, number] =>
  c.map((v) => Math.round(v + (to - v) * f)) as [number, number, number];

/** Brand colour adjusted so black text on it and it on dark/light backgrounds stay readable. */
export function usableAccent(hex: string): [number, number, number] {
  let c = toRgb(hex);
  for (let i = 0; i < 10 && luminance(c) < 0.2; i++) c = mix(c, 255, 0.15);
  for (let i = 0; i < 10 && luminance(c) > 0.62; i++) c = mix(c, 0, 0.12);
  return c;
}

export function applyBrand(color: string | null | undefined): void {
  const root = document.documentElement.style;
  if (!color || !HEX.test(color)) {
    root.removeProperty('--adlr-gold');
    root.removeProperty('--adlr-gold-dim');
    return;
  }
  const c = usableAccent(color);
  const dim = c.map((v) => Math.round(v * 0.68));
  root.setProperty('--adlr-gold', c.join(' '));
  root.setProperty('--adlr-gold-dim', dim.join(' '));
}

export function cacheBrand(brand: Brand | null): void {
  try {
    if (brand && (brand.color || brand.logo)) localStorage.setItem(CACHE_KEY, JSON.stringify(brand));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* quota (logo) — the colour is applied anyway */ }
}

export function cachedBrand(): Brand | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Brand) : null;
  } catch {
    return null;
  }
}

/** Before React renders: last known brand colour, so the app doesn't flash gold first. */
export function initBrand(): void {
  applyBrand(cachedBrand()?.color ?? null);
}
