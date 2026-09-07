import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'store');
mkdirSync(outDir, { recursive: true });

const GOLD = '#C9A84C';
const WHITE = '#FFFFFF';
const BG = '#0A0A0A';

function wordmark(cx, cy, targetW) {
  // native content box: x 6..150 (w144), y 2..46 (h44)
  const nativeW = 144, nativeH = 44, nativeX0 = 6, nativeY0 = 2;
  const scale = targetW / nativeW;
  const targetH = nativeH * scale;
  const tx = cx - targetW / 2 - nativeX0 * scale;
  const ty = cy - targetH / 2 - nativeY0 * scale;
  return `<g fill="none" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">
    <path d="M6 46 L20 6 Q26 2 30 6 L44 46" stroke="${GOLD}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 30 Q27 24 36 30" stroke="${GOLD}" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
    <path d="M52 6 L52 44 Q72 44 72 25 Q72 6 52 6" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M82 6 L82 44 L108 44" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M118 6 L118 44 M118 6 L140 6 Q150 6 150 16 Q150 26 140 26 L118 26 M134 26 L150 44" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// Feature graphic 1024x500
const W = 1024, H = 500;
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="#1a1710"/>
      <stop offset="55%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="none"/>
  ${wordmark(W / 2, 218, 360)}
  <line x1="${W/2 - 150}" y1="300" x2="${W/2 + 150}" y2="300" stroke="${GOLD}" stroke-width="1.5" opacity="0.55"/>
  <text x="${W/2}" y="338" text-anchor="middle" fill="#E7E2D6" font-family="Arial, Helvetica, sans-serif" font-size="26" letter-spacing="7" font-weight="600">STEIG AUF. BLEIB STARK.</text>
  <text x="${W/2}" y="392" text-anchor="middle" fill="${GOLD}" font-family="Arial, Helvetica, sans-serif" font-size="17" letter-spacing="4" opacity="0.85">PREMIUM PERSONAL TRAINING</text>
</svg>`;

async function run() {
  await sharp(Buffer.from(feature)).png().toFile(join(outDir, 'feature-graphic-1024x500.png'));
  console.log('wrote feature-graphic-1024x500.png');
  // Play Store 512 icon from the master icon
  await sharp(join(root, 'assets', 'icon-only.png')).resize(512, 512).png().toFile(join(outDir, 'play-icon-512.png'));
  console.log('wrote play-icon-512.png');
}
run();
