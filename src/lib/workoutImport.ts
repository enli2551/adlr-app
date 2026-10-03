import { EXERCISE_EN } from '@/i18n/exercises';
import { canonicalExercise } from '@/lib/exerciseAliases';

// Import workout history from other tracking apps (CSV exports).
//  • Hevy:   Profile → Settings → Export & Import Data → Export workouts (CSV)
//            columns: title,start_time,end_time,description,exercise_title,superset_id,
//            exercise_notes,set_index,set_type,weight_kg|weight_lbs,reps,distance_km|distance_miles,duration_seconds,rpe
//  • Strong: Settings → Export Strong Data (CSV)
//            columns: Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
// Exercise names are mapped onto ADLR's German library names where they match, so
// imported history feeds the same strength curves/PRs as sets logged in the app.

export type ImportSource = 'hevy' | 'strong';

export interface ImportedSet {
  exercise: string;      // ADLR name (German) when mapped, else the original name
  original: string;      // name as exported
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  set_type: 'warmup' | 'working' | 'dropset';
  duration_sec: number | null;
  distance_km: number | null;
}

export interface ImportedWorkout {
  title: string;
  start: Date;
  end: Date;
  sets: ImportedSet[];
}

export interface ImportResult {
  source: ImportSource;
  workouts: ImportedWorkout[];
  /** original name → ADLR name (null = no match, kept as is) */
  mapping: Map<string, string | null>;
  /** rows dropped because their date could not be read — shown to the user instead of silently lost */
  skippedRows: number;
}

/** RFC-4180-ish CSV parser (quoted fields, escaped quotes, CRLF); auto-detects , or ; */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.indexOf('\n') >>> 0);
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

// Hevy writes month names in the app language: "1 Okt 2026", "11 Sept 2026", "3 Juli 2026",
// "5 Mai", "2 März", "3 Dez"; Hungarian "okt.", "márc." … matched by their first 3 letters.
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, mär: 2, már: 2, apr: 3, ápr: 3, may: 4, mai: 4, máj: 4, jun: 5, jún: 5, jul: 6, júl: 6,
  aug: 7, sep: 8, sze: 8, oct: 9, okt: 9, nov: 10, dec: 11, dez: 11,
};
const monthOf = (name: string): number | undefined => MONTHS[name.toLowerCase().slice(0, 3)];

/** Local wall-clock dates: "8 Jan 2024, 18:02" / "1 Okt 2026, 12:15" (Hevy), "2026. okt. 1. 12:15",
 *  "2024-01-08 18:02:11" (Strong), or ISO. */
export function parseDate(s: string): Date | null {
  const v = s.trim();
  let m = /^(\d{1,2})\.? ([^\d\s,.]+)\.? (\d{4}),? (\d{1,2}):(\d{2})/.exec(v);
  if (m && monthOf(m[2]) != null) return new Date(+m[3], monthOf(m[2])!, +m[1], +m[4], +m[5]);
  m = /^(\d{4})\. ?([^\d\s,.]+)\.? ?(\d{1,2})\.?,? (\d{1,2}):(\d{2})/.exec(v);
  if (m && monthOf(m[2]) != null) return new Date(+m[1], monthOf(m[2])!, +m[3], +m[4], +m[5]);
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Strong's "1h 5m" / "45m" / "3600" → seconds */
function parseDuration(s: string): number {
  if (/^\d+$/.test(s.trim())) return +s;
  const h = /(\d+)\s*h/.exec(s), mi = /(\d+)\s*m(?!s)/.exec(s), se = /(\d+)\s*s/.exec(s);
  return (h ? +h[1] * 3600 : 0) + (mi ? +mi[1] * 60 : 0) + (se ? +se[1] : 0);
}

const num = (s: string | undefined): number | null => {
  if (s == null || s.trim() === '') return null;
  const n = Number(s.replace(',', '.'));
  return isFinite(n) ? n : null;
};

// ── Exercise-name mapping ────────────────────────────────────────────────────
const norm = (s: string) => s.toLowerCase()
  .replace(/[-_/]/g, ' ').replace(/[^a-z0-9äöüß() ]/g, '')
  .split(/\s+/).filter(Boolean).map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)).join(' ');

// Names Hevy/Strong use that differ from the library's English names.
const ALIASES: Record<string, string> = {
  'squat': 'Kniebeugen', 'back squat': 'Kniebeugen', 'full squat': 'Kniebeugen',
  'overhead press': 'Schulterdrücken', 'military press': 'Schulterdrücken',
  'bent over row': 'Rudern (Langhantel)', 'pendlay row': 'Rudern (Langhantel)',
  'bicep curl': 'Bizeps Curls', 'pull up': 'Klimmzüge', 'chin up': 'Chin-ups',
  'lying leg curl': 'Beinbeuger', 'seated leg curl': 'Beinbeuger',
  'chest dip': 'Dips', 'triceps dip': 'Trizeps Dips', 'tricep pushdown': 'Trizepsdrücken', 'triceps pushdown': 'Trizepsdrücken',
  'hip thrust': 'Hip Thrusts', 'standing calf raise': 'Wadenheben', 'push up': 'Liegestütze',
  'lunge': 'Ausfallschritte', 'hammer curl dumbbell': 'Hammer Curls', 'face pull': 'Face Pulls', 'lateral raise': 'Seitheben',
  // German Hevy names (Hevy exports exercise names in the app language)
  'klimmzug': 'Klimmzüge', 'bizepscurl': 'Bizeps Curls', 'bizepscurl langhantel': 'Langhantel Curls',
  'hackenschmidt squat': 'Hackenschmidt Kniebeuge', 'beinstrecken': 'Beinstrecker', 'beinbeugen': 'Beinbeuger',
  'beinbeugen stehend': 'Beinbeuger', 'beinbeugen liegend': 'Beinbeuger', 'beinbeugen sitzend': 'Beinbeuger',
  'butterfly': 'Pec Fly (Maschine)', 'trizep pushdown mit seil': 'Kabel Pushdown (Seil)', 'trizepsdrücken mit dem seil': 'Kabel Pushdown (Seil)',
  'trizep pushdown': 'Kabel Pushdown', 'überkopf trizepsstrecken': 'Kabel Overhead Trizeps Extension (Seil)',
  'hyperextension': 'Hyperextension (Rückenstrecker)', 'wadenheben sitzend': 'Maschine Sitz Wadenheben',
  'sitzendes schulterdrücken': 'Langhantel Sitz Overhead Press', 'stirndrücken': 'Skull Crusher',
  'reverse fliegende': 'Reverse Fly', 'fliegende auf der schrägbank (kurzhantel)': 'Kurzhantel Schrägbank Fly',
  'iso laterales rudern von oben': 'Iso-Lateral High Row',
  'schulterpresse kurzhantel': 'Kurzhantel Bank Sitz Drücken',
};

// Equipment in brackets — German Hevy names use these instead of the English ones.
const EQUIP_DE: Record<string, string> = {
  langhantel: 'barbell', kurzhantel: 'dumbbell', maschine: 'machine', kabelzug: 'cable', kabel: 'cable',
  körpergewicht: 'bodyweight', gewichtet: 'weighted',
};
const EQUIP_PREFIX: Record<string, string> = { dumbbell: 'kurzhantel', barbell: 'langhantel', cable: 'kabel' };

let index: Map<string, string> | null = null;
function exerciseIndex(): Map<string, string> {
  if (index) return index;
  index = new Map();
  for (const [de, en] of Object.entries(EXERCISE_EN)) {
    if (!index.has(norm(en))) index.set(norm(en), de);
    if (!index.has(norm(de))) index.set(norm(de), de);
  }
  for (const [k, de] of Object.entries(ALIASES)) index.set(norm(k), de);
  return index;
}

/** "Bench Press (Barbell)" → "Bankdrücken". Barbell/machine/cable are the library defaults;
 *  dumbbell etc. variants only match a library entry that names that equipment. */
export function mapExerciseName(name: string): string | null {
  const idx = exerciseIndex();
  const full = norm(name);
  if (idx.has(full)) return idx.get(full)!;
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name);
  if (!m) return null;
  const base = norm(m[1]), raw = norm(m[2]), equip = EQUIP_DE[raw] ?? raw;
  const candidates = [`${equip} ${base}`, `${base} ${equip}`, `${base} ${raw}`];
  if (EQUIP_PREFIX[equip]) candidates.push(`${EQUIP_PREFIX[equip]} ${base}`);
  // barbell/machine/cable are the library defaults; "weighted" bodyweight moves log added load
  if (['barbell', 'machine', 'cable', 'bodyweight', 'weighted'].includes(equip)) candidates.push(base);
  for (const c of candidates) if (idx.has(c)) return idx.get(c)!;
  return null;
}

const setTypeOf = (s: string): ImportedSet['set_type'] => {
  const v = s.toLowerCase();
  if (v.includes('warm')) return 'warmup';
  if (v.includes('drop')) return 'dropset';
  return 'working';
};

// ── Parsers ──────────────────────────────────────────────────────────────────
export function parseWorkoutExport(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('empty');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const mapping = new Map<string, string | null>();
  const mapName = (n: string) => {
    if (!mapping.has(n)) { const m = mapExerciseName(n); mapping.set(n, m ? canonicalExercise(m) : null); }
    return mapping.get(n) ?? n;
  };
  const byKey = new Map<string, ImportedWorkout>();
  let skippedRows = 0;

  if (header.includes('exercise_title')) {
    const c = {
      title: col('title'), start: col('start_time'), end: col('end_time'), ex: col('exercise_title'),
      idx: col('set_index'), type: col('set_type'), kg: col('weight_kg'), lbs: col('weight_lbs'),
      reps: col('reps'), km: col('distance_km'), mi: col('distance_miles'), dur: col('duration_seconds'),
    };
    for (const r of rows.slice(1)) {
      if (!(r[c.ex] ?? '').trim()) continue;
      r[c.ex] = r[c.ex].trim();
      const start = parseDate(r[c.start] ?? '');
      if (!start) { skippedRows++; continue; }
      const end = parseDate(r[c.end] ?? '') ?? start;
      const key = `${r[c.start]}|${r[c.title]}`;
      let w = byKey.get(key);
      if (!w) { w = { title: r[c.title] || 'Workout', start, end, sets: [] }; byKey.set(key, w); }
      const kg = c.kg >= 0 ? num(r[c.kg]) : c.lbs >= 0 && num(r[c.lbs]) != null ? Math.round(num(r[c.lbs])! * 0.45359237 * 10) / 10 : null;
      const km = c.km >= 0 ? num(r[c.km]) : c.mi >= 0 && num(r[c.mi]) != null ? Math.round(num(r[c.mi])! * 1.609344 * 100) / 100 : null;
      w.sets.push({
        exercise: mapName(r[c.ex]), original: r[c.ex],
        set_number: (num(r[c.idx]) ?? w.sets.filter((s) => s.original === r[c.ex]).length) + 1,
        weight_kg: kg, reps: num(r[c.reps]), set_type: setTypeOf(r[c.type] ?? ''),
        duration_sec: num(r[c.dur]), distance_km: km,
      });
    }
    return { source: 'hevy', workouts: finish(byKey), mapping, skippedRows };
  }

  if (header.includes('exercise name') && header.includes('date')) {
    const c = {
      date: col('date'), title: col('workout name'), dur: col('duration'), ex: col('exercise name'),
      order: col('set order'), w: col('weight'), unit: col('weight unit'), reps: col('reps'), dist: col('distance'), sec: col('seconds'),
    };
    for (const r of rows.slice(1)) {
      if (!(r[c.ex] ?? '').trim()) continue;
      r[c.ex] = r[c.ex].trim();
      const start = parseDate(r[c.date] ?? '');
      if (!start) { skippedRows++; continue; }
      const order = (r[c.order] ?? '').trim();
      if (/rest timer/i.test(order)) continue; // Strong logs rest-timer rows
      const key = `${r[c.date]}|${r[c.title]}`;
      let w = byKey.get(key);
      if (!w) {
        const secs = c.dur >= 0 ? parseDuration(r[c.dur] ?? '') : 0;
        w = { title: r[c.title] || 'Workout', start, end: new Date(start.getTime() + secs * 1000), sets: [] };
        byKey.set(key, w);
      }
      const raw = num(r[c.w]);
      const lbs = c.unit >= 0 && /lb/i.test(r[c.unit] ?? '');
      w.sets.push({
        exercise: mapName(r[c.ex]), original: r[c.ex],
        set_number: num(order) ?? w.sets.filter((s) => s.original === r[c.ex]).length + 1,
        weight_kg: raw == null ? null : lbs ? Math.round(raw * 0.45359237 * 10) / 10 : raw,
        reps: num(r[c.reps]), set_type: order.toUpperCase() === 'W' ? 'warmup' : order.toUpperCase() === 'D' ? 'dropset' : 'working',
        duration_sec: num(r[c.sec]) || null, distance_km: num(r[c.dist]) || null,
      });
    }
    return { source: 'strong', workouts: finish(byKey), mapping, skippedRows };
  }

  throw new Error('unknown');
}

function finish(byKey: Map<string, ImportedWorkout>): ImportedWorkout[] {
  return [...byKey.values()]
    .filter((w) => w.sets.length > 0)
    .map((w) => ({ ...w, sets: w.sets.map((s) => ({ ...s, weight_kg: s.weight_kg === 0 ? null : s.weight_kg })) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
