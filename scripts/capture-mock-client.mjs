import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'store', 'screenshots-client');
mkdirSync(outDir, { recursive: true });

const BASE = 'http://localhost:5173/';
const EMAIL = 'peter@adlr.at';
const PASSWORD = 'SteigAuf2026!';

const CLIENT_ID = randomUUID();
const TRAINER_ID = randomUUID();
const PLAN_ID = randomUUID();
const now = new Date();
const iso = (d) => d.toISOString();
const dayN = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };
const at = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };

// Monday of current week
const monday = (() => { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d; })();
const weekDate = (off) => { const d = new Date(monday); d.setDate(d.getDate() + off); return d; };

const CLIENT = {
  id: CLIENT_ID, role: 'client', trainer_id: TRAINER_ID, intake_completed: true,
  first_name: 'Lukas', last_name: 'Berger', age: 28, height_cm: 182, weight_kg: 82,
  gender: 'männlich', email: 'lukas@example.at', phone: null, avatar_url: null,
  intake: { goals: ['Muskeln aufbauen'] }, streak: 24, last_active: iso(now), created_at: iso(dayN(60)),
};

// ── Plan days ───────────────────────────────────────────────────────────────
const mkEx = (name, sets, reps, rest_sec, tempo = '', notes = '') => ({ name, sets, reps, rest_sec, tempo, notes });
const dayDefs = [
  ['Push – Brust & Trizeps', 'Brust', 2, 60, false, [mkEx('Bankdrücken', 4, 8, 120), mkEx('Schrägbankdrücken (KH)', 3, 10, 90), mkEx('Butterfly', 3, 12, 60), mkEx('Trizeps-Drücken am Kabel', 3, 12, 60)], 'Fokus auf saubere Technik. Kein Ego-Lifting.'],
  ['Pull – Rücken & Bizeps', 'Rücken', 2, 60, false, [mkEx('Klimmzüge', 4, 8, 120), mkEx('Langhantelrudern', 4, 10, 90), mkEx('Latzug', 3, 12, 60), mkEx('Bizeps-Curls', 3, 12, 60)], ''],
  ['Ruhetag', null, 1, null, true, [], ''],
  ['Legs – Beine', 'Beine', 3, 70, false, [mkEx('Kniebeuge', 4, 8, 150), mkEx('Beinpresse', 3, 12, 90), mkEx('Rumänisches Kreuzheben', 3, 10, 120), mkEx('Wadenheben', 4, 15, 45)], 'Tiefe vor Gewicht.'],
  ['Oberkörper – Schultern', 'Schultern', 2, 55, false, [mkEx('Schulterdrücken', 4, 10, 90), mkEx('Seitheben', 3, 15, 45), mkEx('Face Pulls', 3, 15, 45), mkEx('Klimmzüge', 3, 8, 90)], ''],
  ['Zone 2 Cardio', 'Ausdauer', 1, 40, false, [mkEx('Laufband Zone 2 (30 Min)', 1, 1, 0)], 'Ruhiges Tempo, Nase-Atmung.'],
  ['Ruhetag', null, 1, null, true, [], ''],
];
const planDays = dayDefs.map(([workout_name, focus, difficulty, duration_min, is_rest_day, exercises, notes], i) => ({
  id: randomUUID(), plan_id: PLAN_ID, day_of_week: i, workout_name: is_rest_day ? null : workout_name, focus, difficulty, duration_min, notes, exercises, is_rest_day,
}));
const montag = planDays[0], dienstag = planDays[1];

// ── Completions this week (Mon + Tue done) ──────────────────────────────────
const compMontag = { id: randomUUID(), client_id: CLIENT_ID, plan_day_id: montag.id, completed_at: iso(at(weekDate(0), 18)) };
const completions = [compMontag, { id: randomUUID(), client_id: CLIENT_ID, plan_day_id: dienstag.id, completed_at: iso(at(weekDate(1), 18)) }];

// ── Exercise set logs (old + recent → training trends) ──────────────────────
const mkLog = (ex, w, reps, n, compId = null, pdId = null) => ({ id: randomUUID(), client_id: CLIENT_ID, workout_completion_id: compId, plan_day_id: pdId, exercise_name: ex, set_number: n, weight_kg: w, reps, created_at: iso(dayN(21 - n)) });
const setLogs = [
  mkLog('Bankdrücken', 80, 8, 1), mkLog('Kniebeuge', 110, 8, 1), mkLog('Kreuzheben', 150, 5, 1),
  // recent (linked to this week's Montag completion)
  { id: randomUUID(), client_id: CLIENT_ID, workout_completion_id: compMontag.id, plan_day_id: montag.id, exercise_name: 'Bankdrücken', set_number: 1, weight_kg: 92, reps: 8, created_at: iso(at(weekDate(0), 18)) },
  { id: randomUUID(), client_id: CLIENT_ID, workout_completion_id: null, plan_day_id: null, exercise_name: 'Kniebeuge', set_number: 1, weight_kg: 132, reps: 8, created_at: iso(dayN(2)) },
  { id: randomUUID(), client_id: CLIENT_ID, workout_completion_id: null, plan_day_id: null, exercise_name: 'Kreuzheben', set_number: 1, weight_kg: 175, reps: 3, created_at: iso(dayN(1)) },
];

// ── Progress entries (weight trend) ─────────────────────────────────────────
const progressEntries = [84, 83.2, 82.6, 81.4, 80.2, 79.1].map((w, i) => ({
  id: randomUUID(), client_id: CLIENT_ID, weight_kg: w, waist_cm: 92 - i, chest_cm: 104 + i * 0.3, hips_cm: 98, arm_cm: 38 + i * 0.2, thigh_cm: 60, logged_at: iso(dayN((5 - i) * 7)),
}));

const personalRecords = [
  ['Bankdrücken', 100, 1], ['Kniebeuge', 140, 1], ['Kreuzheben', 180, 3], ['Schulterdrücken', 62, 5],
].map(([exercise_name, weight_kg, reps]) => ({ id: randomUUID(), client_id: CLIENT_ID, exercise_name, weight_kg, reps, achieved_at: iso(dayN(5)) }));

const dailyCheckins = [4, 5, 4, 5, 4, 4, 5].map((v, i) => ({ id: randomUUID(), client_id: CLIENT_ID, energy: v, mood: (i % 2 ? 5 : 4), note: null, logged_at: iso(dayN(i)) }));

// ── Nutrition ───────────────────────────────────────────────────────────────
const todayStr = iso(now).slice(0, 10);
const principles = ['1.6-2g Protein pro kg Körpergewicht', 'Kalorienüberschuss', 'Post-Workout-Carb'];
const principleCheckins = [];
principles.forEach((p) => { for (let d = 0; d < 5; d++) principleCheckins.push({ id: randomUUID(), client_id: CLIENT_ID, principle: p, adhered: true, log_date: iso(weekDate(d)).slice(0, 10), created_at: iso(weekDate(d)) }); });

// ── Coach ───────────────────────────────────────────────────────────────────
const messages = [
  ['trainer', 'Willkommen bei ADLR, Lukas! Bereit für Woche 1?', 5],
  ['client', 'Absolut. Wann ist die erste Session?', 5],
  ['trainer', 'Dienstag 18:00 im Studio. Bring Wasser mit.', 4],
  ['client', 'Perfekt, danke Peter! 💪', 4],
  ['trainer', 'Starke Einheit heute. 3 neue PRs – weiter so!', 1],
].map(([sender, body, n]) => ({ id: randomUUID(), client_id: CLIENT_ID, sender, body, sent_at: iso(dayN(n)) }));
const nextSession = { id: randomUUID(), client_id: CLIENT_ID, trainer_id: TRAINER_ID, scheduled_at: iso(at(dayN(-2), 18)), duration_min: 60, location: 'Studio Enzesfeld', status: 'scheduled' };
const sessionNote = { id: randomUUID(), client_id: CLIENT_ID, trainer_id: TRAINER_ID, body: 'Starke Kniebeuge heute. Tiefe war deutlich besser. Nächstes Mal +5kg.', created_at: iso(dayN(3)) };
const weeklyMessage = { id: randomUUID(), client_id: CLIENT_ID, body: 'Diese Woche will ich 100% bei den Grundübungen sehen. Du bist bereit – vertrau dem Prozess.', created_at: iso(dayN(1)) };
const nutritionTip = { id: randomUUID(), client_id: CLIENT_ID, tip: 'Iss in den 2 Stunden nach dem Training deine größte Kohlenhydrat-Portion. Dein Körper nutzt sie optimal.', updated_at: iso(dayN(1)) };
const hydration = { id: randomUUID(), client_id: CLIENT_ID, glasses: 5, log_date: todayStr };

// ── Router ──────────────────────────────────────────────────────────────────
function mockFor(table, wantObject) {
  switch (table) {
    case 'profiles': return CLIENT;
    case 'client_plans': return { plan_id: PLAN_ID };
    case 'plan_days': return planDays;
    case 'workout_completions': return completions;
    case 'exercise_set_logs': return setLogs;
    case 'progress_entries': return progressEntries;
    case 'personal_records': return personalRecords;
    case 'daily_checkins': return dailyCheckins;
    case 'progress_photos': return [];
    case 'nutrition_tips': return nutritionTip;
    case 'hydration_logs': return hydration;
    case 'nutrition_principle_checkins': return principleCheckins;
    case 'sessions': return wantObject ? nextSession : [nextSession];
    case 'session_notes': return sessionNote;
    case 'weekly_messages': return weeklyMessage;
    case 'messages': return messages;
    default: return wantObject ? null : [];
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

await context.route(/\/rest\/v1\//, async (route) => {
  const req = route.request();
  if (req.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  const url = new URL(req.url());
  const table = url.pathname.split('/rest/v1/')[1].split('?')[0];
  const wantObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-25/*' }, body: JSON.stringify(mockFor(table, wantObject)) });
});

const page = await context.newPage();
async function shot(name, wait = 1000) { await page.waitForTimeout(wait); await page.screenshot({ path: join(outDir, name) }); console.log('shot', name); }

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
try { await page.getByRole('button', { name: 'Anmelden' }).first().click(); } catch {}
await page.waitForTimeout(300);
await page.getByPlaceholder('deine@email.at').fill(EMAIL);
await page.getByPlaceholder('Mindestens 6 Zeichen').fill(PASSWORD);
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(3000);

await shot('01-plan.png');
// Expand first training day to show exercises
try { await page.getByText('Push – Brust & Trizeps', { exact: false }).first().click(); await shot('02-plan-tag.png', 900); } catch (e) { console.log('skip expand', e.message); }

const tabs = [
  ['Fortschritt', '03-fortschritt.png', 1500],
  ['Ernährung', '04-ernaehrung.png', 1200],
  ['Coach', '05-coach.png', 1200],
  ['Upgrades', '06-upgrades.png', 1000],
  ['Profil', '07-profil.png', 1600],
];
for (const [label, file, w] of tabs) {
  try { await page.getByText(label, { exact: true }).last().click(); await shot(file, w); }
  catch (e) { console.log('skip', label, e.message); }
}

// Active training banner: back to Plan, expand a training day, start training
try {
  await page.getByText('Training', { exact: true }).last().click();
  await page.waitForTimeout(1000);
  await page.getByText('Legs – Beine', { exact: false }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Training starten', { exact: false }).first().click();
  await page.waitForTimeout(3000);
  await shot('08-training-aktiv.png', 500);
  // Log a PR-beating set for Kniebeuge (mock PR is 140kg) and finish → celebration
  await page.getByPlaceholder('kg').first().fill('145');
  await page.getByPlaceholder('Wdh').first().fill('8');
  await page.getByText('Training beenden', { exact: false }).first().click();
  await page.waitForTimeout(700);
  await shot('09-celebration.png', 150);
} catch (e) { console.log('skip training', e.message); }

await browser.close();
console.log('done');
