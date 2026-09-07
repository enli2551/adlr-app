import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const animDir = join(root, 'public', 'exercises', 'anim');
mkdirSync(animDir, { recursive: true });
const SRC = 'D:/DEV/claude/übungen2.png'; // 5x2 grid, each cell 2 positions stacked

// [name, A-box (top position), B-box (bottom position)]
const items = [
  ['bankdruecken', { left: 12,  top: 40,  width: 283, height: 210 }, { left: 12,  top: 258, width: 283, height: 245 }],
  ['schulter',     { left: 319, top: 40,  width: 283, height: 210 }, { left: 319, top: 258, width: 283, height: 245 }],
  ['hammer',       { left: 319, top: 552, width: 283, height: 210 }, { left: 319, top: 770, width: 283, height: 245 }],
  ['dips',         { left: 934, top: 552, width: 283, height: 210 }, { left: 934, top: 770, width: 283, height: 245 }],
];

async function frame(name, suffix, box) {
  const out = join(animDir, `${name}-${suffix}.png`);
  await sharp(SRC).extract(box).flatten({ background: '#ffffff' })
    .resize(420, 420, { fit: 'contain', background: '#ffffff' }).png().toFile(out);
}

for (const [name, a, b] of items) { await frame(name, 'a', a); await frame(name, 'b', b); console.log('frames', name); }

const labels = { bankdruecken: 'Kurzhantel Bankdrücken', schulter: 'Kurzhantel Schulterdrücken', hammer: 'Hammercurls', dips: 'Dips' };
const cards = items.map(([n]) => `
  <div class="card">
    <div class="stage">
      <img class="f fa" src="/exercises/anim/${n}-a.png" alt="">
      <img class="f fb" src="/exercises/anim/${n}-b.png" alt="">
    </div>
    <p class="lbl">${labels[n]}</p>
  </div>`).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;background:#0A0A0A;color:#EDEAE0;font-family:Inter,system-ui,sans-serif;padding:24px}
  h1{font-size:20px;text-align:center;color:#C9A84C;margin:0 0 6px}
  p.sub{text-align:center;color:#9a958a;font-size:13px;margin:0 0 24px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;max-width:760px;margin:0 auto}
  .card{background:#141310;border:1px solid #26241f;border-radius:16px;padding:12px}
  .stage{position:relative;width:100%;aspect-ratio:1;background:#fff;border-radius:12px;overflow:hidden}
  .f{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
  .fa{animation:toggleA 1.6s steps(1) infinite}
  .fb{animation:toggleB 1.6s steps(1) infinite}
  @keyframes toggleA{0%,50%{opacity:1}50.01%,100%{opacity:0}}
  @keyframes toggleB{0%,50%{opacity:0}50.01%,100%{opacity:1}}
  .lbl{text-align:center;font-size:13px;font-weight:600;margin:10px 0 2px}
</style></head><body>
  <h1>ADLR — Übungs-Animation (Vorschau)</h1>
  <p class="sub">2-Frame Animation (Start ↔ End) aus deinen eigenen Bildern · offline · kostenlos</p>
  <div class="grid">${cards}</div>
</body></html>`;
writeFileSync(join(root, 'public', 'anim-preview.html'), html);
console.log('html written');
