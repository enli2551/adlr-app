import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'store', 'screenshots');
mkdirSync(outDir, { recursive: true });

const BASE = 'http://localhost:5173/';
const EMAIL = 'peter@adlr.at';
const PASSWORD = 'SteigAuf2026!';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

async function shot(name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(outDir, name) });
  console.log('shot', name);
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// Switch to login mode
try { await page.getByRole('button', { name: 'Anmelden' }).first().click(); } catch {}
await page.waitForTimeout(400);
await page.getByPlaceholder('deine@email.at').fill(EMAIL);
await page.getByPlaceholder('Mindestens 6 Zeichen').fill(PASSWORD);
await shot('00-login.png');
// Submit
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(3000);

await shot('01-uebersicht.png');

const tabs = [
  ['Klienten', '02-klienten.png'],
  ['Plan Builder', '03-plan-builder.png'],
  ['Kalender', '04-kalender.png'],
  ['Nachrichten', '05-nachrichten.png'],
  ['Business', '06-business.png'],
];
for (const [label, file] of tabs) {
  try {
    await page.getByText(label, { exact: true }).last().click();
    await page.waitForTimeout(1500);
    await shot(file);
  } catch (e) {
    console.log('skip', label, e.message);
  }
}

await browser.close();
console.log('done');
