import { supabase } from '@/lib/supabase';
import { getLang } from '@/lib/i18n';
import type { BaseRow } from '@/data/foodsBase';

// Calorie counter (migration 20261020_food_log.sql). Three sources:
//  * base   — built-in basic foods (chicken breast, rice, oats …), USDA values, DE/EN/HU names
//  * off    — Open Food Facts: packaged products by barcode or name (strong in AT/DE)
//  * custom — the client's own foods
// Everything is handled per 100 g; an entry stores the totals for the eaten amount.

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Frühstück' },
  { id: 'lunch', label: 'Mittagessen' },
  { id: 'dinner', label: 'Abendessen' },
  { id: 'snack', label: 'Snacks' },
];

export interface Per100 { kcal: number; protein: number; carbs: number; fat: number }

export interface Food {
  source: 'base' | 'off' | 'custom';
  id: string;              // base id / barcode / custom_foods.id
  name: string;
  brand?: string | null;
  per100: Per100;
  serving_g?: number | null;
  serving_label?: string | null;
}

export interface FoodLog {
  id: string; client_id: string; log_date: string; meal: Meal;
  name: string; brand: string | null; source: Food['source']; source_id: string | null;
  amount_g: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number;
  per100: Per100 | null; created_at: string;
}

export interface MacroTargets { protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null }

const r1 = (n: number) => Math.round(n * 10) / 10;

export function totalsFor(per100: Per100, grams: number) {
  const f = grams / 100;
  return { kcal: Math.round(per100.kcal * f), protein_g: r1(per100.protein * f), carbs_g: r1(per100.carbs * f), fat_g: r1(per100.fat * f) };
}

export function sumLogs(logs: Pick<FoodLog, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>[]) {
  return logs.reduce((s, l) => ({
    kcal: s.kcal + Number(l.kcal), protein_g: s.protein_g + Number(l.protein_g),
    carbs_g: s.carbs_g + Number(l.carbs_g), fat_g: s.fat_g + Number(l.fat_g),
  }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
}

/** Meal by time of day (default for a new entry). */
export function mealNow(d = new Date()): Meal {
  const h = d.getHours();
  return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

// ── Built-in basic foods ─────────────────────────────────────────────────────
let baseCache: BaseRow[] | null = null;
async function baseFoods(): Promise<BaseRow[]> {
  if (!baseCache) baseCache = (await import('@/data/foodsBase')).default;
  return baseCache;
}
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const baseToFood = (r: BaseRow): Food => {
  const lang = getLang();
  return {
    source: 'base', id: r.id, name: lang === 'hu' ? r.hu : lang === 'en' ? r.en : r.de,
    per100: { kcal: r.k, protein: r.p, carbs: r.c, fat: r.f }, serving_g: r.s ?? null, serving_label: r.sl ?? null,
  };
};

export async function searchBase(q: string, limit = 25): Promise<Food[]> {
  const rows = await baseFoods();
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { r: BaseRow; score: number }[] = [];
  for (const r of rows) {
    const hay = norm(`${r.de} ${r.en} ${r.hu} ${r.tags ?? ''}`);
    if (!words.every((w) => hay.includes(w))) continue;
    const own = norm(getLang() === 'hu' ? r.hu : getLang() === 'en' ? r.en : r.de);
    scored.push({ r, score: (own.startsWith(words[0]) ? 0 : 1) + own.length / 100 });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((x) => baseToFood(x.r));
}

// ── Open Food Facts ──────────────────────────────────────────────────────────
const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,product_name_de,product_name_en,product_name_hu,brands,nutriments,serving_quantity,serving_size';

interface OffProduct {
  code?: string; product_name?: string; product_name_de?: string; product_name_en?: string; product_name_hu?: string;
  brands?: string; serving_quantity?: number | string; serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

function offToFood(p: OffProduct): Food | null {
  const n = p.nutriments ?? {};
  const num = (k: string) => { const v = Number(n[k]); return Number.isFinite(v) ? v : null; };
  let kcal = num('energy-kcal_100g');
  if (kcal == null) { const kj = num('energy-kj_100g') ?? num('energy_100g'); if (kj != null) kcal = kj / 4.184; }
  if (kcal == null || !p.code) return null;
  const lang = getLang();
  const name = (lang === 'hu' && p.product_name_hu) || (lang === 'en' && p.product_name_en) || p.product_name_de || p.product_name || p.product_name_en;
  if (!name) return null;
  const serving = Number(p.serving_quantity);
  return {
    source: 'off', id: p.code, name: name.trim(), brand: p.brands?.split(',')[0]?.trim() || null,
    per100: { kcal: Math.round(kcal), protein: r1(num('proteins_100g') ?? 0), carbs: r1(num('carbohydrates_100g') ?? 0), fat: r1(num('fat_100g') ?? 0) },
    serving_g: Number.isFinite(serving) && serving > 0 ? serving : null, serving_label: p.serving_size ?? null,
  };
}

async function getJson(url: string, ms = 9000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

/** Packaged products by name (Austria first). Network errors → []. */
export async function searchOff(q: string): Promise<Food[]> {
  if (q.trim().length < 3) return [];
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q.trim())}&search_simple=1&action=process&json=1&page_size=20&countries_tags_en=austria&fields=${OFF_FIELDS}`;
  try {
    const data = (await getJson(url)) as { products?: OffProduct[] };
    let list = (data.products ?? []).map(offToFood).filter(Boolean) as Food[];
    if (list.length < 5) {
      const world = (await getJson(url.replace('&countries_tags_en=austria', ''))) as { products?: OffProduct[] };
      const more = (world.products ?? []).map(offToFood).filter(Boolean) as Food[];
      const seen = new Set(list.map((f) => f.id));
      list = [...list, ...more.filter((f) => !seen.has(f.id))];
    }
    return list;
  } catch { return []; }
}

/** One product by barcode: own foods first, then Open Food Facts. */
export async function lookupBarcode(code: string): Promise<Food | null> {
  const clean = code.replace(/\D/g, '');
  if (!clean) return null;
  const { data: own } = await supabase.from('custom_foods').select('*').eq('barcode', clean).limit(1);
  if (own && own.length) return customToFood(own[0] as CustomFoodRow);
  try {
    const data = (await getJson(`${OFF}/api/v2/product/${clean}?fields=${OFF_FIELDS}`)) as { status?: number; product?: OffProduct };
    return data.status === 1 && data.product ? offToFood({ ...data.product, code: data.product.code ?? clean }) : null;
  } catch { return null; }
}

// ── Own foods + recents ──────────────────────────────────────────────────────
export interface CustomFoodRow { id: string; name: string; brand: string | null; barcode: string | null; kcal_100: number; protein_100: number; carbs_100: number; fat_100: number; serving_g: number | null }
export const customToFood = (r: CustomFoodRow): Food => ({
  source: 'custom', id: r.id, name: r.name, brand: r.brand,
  per100: { kcal: Number(r.kcal_100), protein: Number(r.protein_100), carbs: Number(r.carbs_100), fat: Number(r.fat_100) },
  serving_g: r.serving_g,
});

export async function myFoods(): Promise<Food[]> {
  const { data, error } = await supabase.from('custom_foods').select('*').order('name');
  return error ? [] : ((data ?? []) as CustomFoodRow[]).map(customToFood);
}

/** Recently eaten (distinct), newest first — the quickest way to log the usual things. */
export async function recentFoods(clientId: string, limit = 30): Promise<(Food & { last_g: number })[]> {
  const { data } = await supabase.from('food_logs').select('name, brand, source, source_id, amount_g, per100, created_at')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(200);
  const seen = new Set<string>();
  const out: (Food & { last_g: number })[] = [];
  for (const r of (data ?? []) as Pick<FoodLog, 'name' | 'brand' | 'source' | 'source_id' | 'amount_g' | 'per100'>[]) {
    const key = `${r.source}:${r.source_id ?? r.name}`;
    if (seen.has(key) || !r.per100) continue;
    seen.add(key);
    out.push({ source: r.source, id: r.source_id ?? r.name, name: r.name, brand: r.brand, per100: r.per100, last_g: Number(r.amount_g) });
    if (out.length >= limit) break;
  }
  return out;
}

export async function addLog(clientId: string, day: string, meal: Meal, food: Food, grams: number) {
  const tot = totalsFor(food.per100, grams);
  return supabase.from('food_logs').insert({
    client_id: clientId, log_date: day, meal, name: food.name.slice(0, 200), brand: food.brand ?? null,
    source: food.source, source_id: food.id, amount_g: grams, per100: food.per100, ...tot,
  }).select('*').single();
}

export async function dayLogs(clientId: string, day: string): Promise<FoodLog[] | null> {
  const { data, error } = await supabase.from('food_logs').select('*').eq('client_id', clientId).eq('log_date', day).order('created_at');
  return error ? null : ((data ?? []) as FoodLog[]);
}

/** Daily totals for a date range (coach view, weekly chart, check-in). */
export async function dailyTotals(clientId: string, from: string, to: string): Promise<Map<string, ReturnType<typeof sumLogs>>> {
  const { data } = await supabase.from('food_logs').select('log_date, kcal, protein_g, carbs_g, fat_g').eq('client_id', clientId).gte('log_date', from).lte('log_date', to);
  const by = new Map<string, Pick<FoodLog, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>[]>();
  for (const r of (data ?? []) as (Pick<FoodLog, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'> & { log_date: string })[]) {
    by.set(r.log_date, [...(by.get(r.log_date) ?? []), r]);
  }
  return new Map([...by].map(([d, rows]) => [d, sumLogs(rows)]));
}

/** Health rows (Apple Health / Health Connect) with the diary laid over them: a day that has
 *  diary entries takes kcal + macros from the diary; days only in the diary are added. */
export async function withDiary<T extends { day: string; kcal_in?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null }>(
  clientId: string, rows: T[], from: string, to: string,
): Promise<T[]> {
  const diary = await dailyTotals(clientId, from, to).catch(() => new Map<string, ReturnType<typeof sumLogs>>());
  if (!diary.size) return rows;
  const by = new Map(rows.map((r) => [r.day, r]));
  for (const [day, s] of diary) {
    if (s.kcal <= 0) continue;
    const base = (by.get(day) ?? { day }) as T;
    by.set(day, { ...base, kcal_in: Math.round(s.kcal), protein_g: Math.round(s.protein_g), carbs_g: Math.round(s.carbs_g), fat_g: Math.round(s.fat_g) });
  }
  return [...by.values()].sort((a, b) => a.day.localeCompare(b.day));
}
