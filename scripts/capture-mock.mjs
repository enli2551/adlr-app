import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'store', 'screenshots-mock');
mkdirSync(outDir, { recursive: true });

const BASE = 'http://localhost:5173/';
const EMAIL = 'peter@adlr.at';
const PASSWORD = 'SteigAuf2026!';

const PETER_ID = randomUUID();
const now = new Date();
const iso = (d) => d.toISOString();
const daysAgo = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };

// ── Mock clients ────────────────────────────────────────────────────────────
const CLIENTS = [
  ['Lukas', 'Berger', 'Muskeln aufbauen', 24, 1],
  ['Sarah', 'Wagner', 'Gewicht reduzieren', 18, 0],
  ['Julia', 'Hofer', 'Allgemeine Fitness & Energie', 31, 2],
  ['Michael', 'Gruber', 'Muskeln aufbauen', 12, 1],
  ['Anna', 'Steiner', 'Muskeln aufbauen', 15, 3],
  ['Thomas', 'Mayer', 'Gewicht reduzieren', 7, 0],
  ['Laura', 'Fischer', 'Gewicht reduzieren', 22, 1],
  ['David', 'Huber', 'Allgemeine Fitness & Energie', 9, 2],
].map(([first_name, last_name, goal, streak, lastN], i) => ({
  id: randomUUID(),
  role: 'client',
  trainer_id: PETER_ID,
  intake_completed: true,
  first_name, last_name,
  age: 24 + i, height_cm: 175, weight_kg: 78 - i, gender: i % 2 ? 'weiblich' : 'männlich',
  email: `${first_name.toLowerCase()}@example.at`, phone: null, avatar_url: null,
  intake: { goals: [goal] },
  streak,
  last_active: iso(daysAgo(lastN)),
  created_at: iso(daysAgo(60 - i * 5)),
}));

const PETER = {
  id: PETER_ID, role: 'trainer', trainer_id: null, intake_completed: true,
  first_name: 'Peter', last_name: 'Fodor', age: null, height_cm: null, weight_kg: null,
  gender: 'männlich', email: EMAIL, phone: null, avatar_url: null, intake: {},
  streak: 0, last_active: iso(now), created_at: iso(daysAgo(400)),
};

// ── Sessions ────────────────────────────────────────────────────────────────
const monday = (() => { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(9, 0, 0, 0); return d; })();
const mkSession = (dt) => ({ id: randomUUID(), client_id: CLIENTS[Math.floor(Math.random() * CLIENTS.length)].id, trainer_id: PETER_ID, scheduled_at: iso(dt), duration_min: 60, location: 'Studio', status: 'completed' });
// This week: 6 sessions
const weekSessions = [0, 0, 1, 2, 3, 4].map((off) => { const d = new Date(monday); d.setDate(d.getDate() + off); d.setHours(8 + off, 0, 0, 0); return mkSession(d); });
// Last 4 weeks for the chart: counts 5,7,6,8
const monthSessions = [];
[5, 7, 6, 8].forEach((count, wi) => {
  const wStart = new Date(monday); wStart.setDate(wStart.getDate() - (3 - wi) * 7);
  for (let k = 0; k < count; k++) { const d = new Date(wStart); d.setDate(d.getDate() + (k % 5)); d.setHours(8 + (k % 8), 0, 0, 0); monthSessions.push(mkSession(d)); }
});

// ── Workout completions (this month) ────────────────────────────────────────
const completions = [];
CLIENTS.forEach((c) => { const n = 3 + Math.floor(Math.random() * 4); for (let k = 0; k < n; k++) completions.push({ id: randomUUID(), client_id: c.id, plan_day_id: null, completed_at: iso(daysAgo(k * 2 + 1)) }); });

// ── Daily checkins (this week) ──────────────────────────────────────────────
const checkins = CLIENTS.slice(0, 6).map((c) => ({ id: randomUUID(), client_id: c.id, energy: 4, mood: 4, note: null, logged_at: iso(daysAgo(1)).slice(0, 10) }));
checkins.push({ id: randomUUID(), client_id: CLIENTS[0].id, energy: 5, mood: 4, note: null, logged_at: iso(daysAgo(2)).slice(0, 10) });

// ── Upsell requests ─────────────────────────────────────────────────────────
const upsells = [
  ['extra', 'pending', CLIENTS[1]],
  ['nutrition', 'pending', CLIENTS[0]],
  ['checkin', 'completed', CLIENTS[2]],
  ['body', 'pending', CLIENTS[3]],
].map(([upgrade_key, status, c]) => ({ id: randomUUID(), client_id: c.id, upgrade_key, status, created_at: iso(daysAgo(2)), profiles: { first_name: c.first_name, last_name: c.last_name } }));

// ── Business revenue (this month) ───────────────────────────────────────────
const thisMonth = (day) => { const d = new Date(now.getFullYear(), now.getMonth(), day); return iso(d); };
const revenue = [
  ['Training Pakete', 1200, 3], ['Personal Training', 780, 6], ['Ernährungs-Analyse', 245, 8],
  ['Körperanalyse', 290, 10], ['Extra Sessions', 390, 12], ['Check-in Calls', 335, 14],
].map(([source, amount, day]) => ({ id: randomUUID(), trainer_id: PETER_ID, amount, source, month_date: thisMonth(day), note: null }));

// ── Plans ───────────────────────────────────────────────────────────────────
const plans = [
  ['Push / Pull / Legs – Woche 1', false], ['Oberkörper Kraft – 5x5', false],
  ['Ganzkörper Anfänger', true], ['Fettabbau 3er-Split', false], ['Beine & Core Intensiv', false],
].map(([name, is_template], i) => ({ id: randomUUID(), trainer_id: PETER_ID, name, is_template, created_at: iso(daysAgo(i * 7 + 3)) }));

// ── Messages (for chat view with first client) ──────────────────────────────
const chatClient = CLIENTS[0];
const messages = [
  ['trainer', 'Willkommen bei ADLR, Lukas! Bereit für Woche 1?', 5],
  ['client', 'Absolut. Wann ist die erste Session?', 5],
  ['trainer', 'Dienstag 18:00 im Studio. Bring Wasser mit.', 4],
  ['client', 'Perfekt, danke Peter! 💪', 4],
  ['trainer', 'Starke Einheit heute. 3 neue PRs – weiter so!', 1],
  ['client', 'Fühle mich stärker jede Woche.', 1],
].map(([sender, body, n]) => ({ id: randomUUID(), client_id: chatClient.id, sender, body, sent_at: iso(daysAgo(n)) }));

// ── Mock router ─────────────────────────────────────────────────────────────
function mockFor(table, url) {
  const sp = url.searchParams;
  switch (table) {
    case 'profiles': {
      const idf = sp.get('id');
      const role = sp.get('role');
      if (idf && idf.startsWith('eq.') && !role) return PETER; // self lookup (maybeSingle → object)
      return CLIENTS;
    }
    case 'sessions': {
      const g = sp.get('scheduled_at') || '';
      const m = g.match(/gte\.(.+)/);
      if (m) { const d = new Date(decodeURIComponent(m[1])); const days = (now - d) / 86400000; if (days <= 8) return weekSessions; }
      return monthSessions;
    }
    case 'workout_completions': return completions;
    case 'daily_checkins': return checkins;
    case 'upsell_requests': return upsells;
    case 'business_revenue': return revenue;
    case 'plans': return plans;
    case 'messages': return messages;
    default: return [];
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

await context.route(/\/rest\/v1\//, async (route) => {
  const req = route.request();
  if (req.method() !== 'GET') { return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); }
  const url = new URL(req.url());
  const table = url.pathname.split('/rest/v1/')[1].split('?')[0];
  const data = mockFor(table, url);
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-25/*' }, body: JSON.stringify(data) });
});

const page = await context.newPage();
async function shot(name, wait = 900) { await page.waitForTimeout(wait); await page.screenshot({ path: join(outDir, name) }); console.log('shot', name); }

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
try { await page.getByRole('button', { name: 'Anmelden' }).first().click(); } catch {}
await page.waitForTimeout(300);
await page.getByPlaceholder('deine@email.at').fill(EMAIL);
await page.getByPlaceholder('Mindestens 6 Zeichen').fill(PASSWORD);
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(3000);

await shot('01-uebersicht.png');

const tabs = [
  ['Klienten', '02-klienten.png', 1200],
  ['Plan Builder', '03-plan-builder.png', 1200],
  ['Business', '04-business.png', 1800],
  ['Nachrichten', '05-nachrichten.png', 1200],
];
for (const [label, file, w] of tabs) {
  try { await page.getByText(label, { exact: true }).last().click(); await shot(file, w); }
  catch (e) { console.log('skip', label, e.message); }
}

// Chat view: click first client in the inbox
try {
  await page.getByText(`${chatClient.first_name} ${chatClient.last_name}`, { exact: false }).first().click();
  await shot('06-chat.png', 1200);
} catch (e) { console.log('skip chat', e.message); }

await browser.close();
console.log('done');
