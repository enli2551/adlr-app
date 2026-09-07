import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'assets');
mkdirSync(assetsDir, { recursive: true });

const GOLD = '#C9A84C';
const WHITE = '#FFFFFF';
const BG = '#0A0A0A';

// ADLR wordmark paths in native 200x50 coordinate space (from src/components/Logo.tsx)
function wordmark() {
  return `
    <path d="M6 46 L20 6 Q26 2 30 6 L44 46" stroke="${GOLD}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 30 Q27 24 36 30" stroke="${GOLD}" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
    <path d="M52 6 L52 44 Q72 44 72 25 Q72 6 52 6" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M82 6 L82 44 L108 44" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M118 6 L118 44 M118 6 L140 6 Q150 6 150 16 Q150 26 140 26 L118 26 M134 26 L150 44" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

// Center the wordmark (native content box x:6..150 -> w=144, y:2..46 -> h=44)
// into a `size` canvas at target width fraction `wFrac`.
function centeredGroup(size, wFrac) {
  const nativeW = 144, nativeH = 44, nativeX0 = 6, nativeY0 = 2;
  const targetW = size * wFrac;
  const scale = targetW / nativeW;
  const targetH = nativeH * scale;
  const tx = (size - targetW) / 2 - nativeX0 * scale;
  const ty = (size - targetH) / 2 - nativeY0 * scale;
  return `<g fill="none" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">${wordmark()}</g>`;
}

function svg(size, { bg, wFrac }) {
  const bgRect = bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bgRect}${centeredGroup(size, wFrac)}</svg>`;
}

async function render(name, svgStr) {
  const out = join(assetsDir, name);
  await sharp(Buffer.from(svgStr)).png().toFile(out);
  console.log('wrote', out);
}

const jobs = [
  // Full icon with background (legacy / store base)
  ['icon-only.png', svg(1024, { bg: BG, wFrac: 0.62 })],
  // Adaptive icon foreground (transparent, kept inside safe zone ~62%)
  ['icon-foreground.png', svg(1024, { bg: null, wFrac: 0.58 })],
  // Adaptive icon background (solid brand black)
  ['icon-background.png', `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/></svg>`],
  // Splash screens
  ['splash.png', svg(2732, { bg: BG, wFrac: 0.40 })],
  ['splash-dark.png', svg(2732, { bg: BG, wFrac: 0.40 })],
];

for (const [name, s] of jobs) await render(name, s);
console.log('done');
