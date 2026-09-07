import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'exercises');
mkdirSync(outDir, { recursive: true });

const SRC1 = 'D:/DEV/claude/image-1787573303312.webp'; // Squat, Deadlift, Bench, OHP, Pull-up
const SRC2 = 'D:/DEV/claude/image-1787573288870.webp'; // Row, Lunge, Biceps, Triceps, Plank

const jobs = [
  ['kniebeuge.png',        SRC1, { left: 80,  top: 60,  width: 400, height: 420 }],
  ['kreuzheben.png',       SRC1, { left: 530, top: 50,  width: 340, height: 450 }],
  ['bankdruecken.png',     SRC1, { left: 995, top: 40,  width: 535, height: 470 }],
  ['schulterdruecken.png', SRC1, { left: 270, top: 490, width: 450, height: 490 }],
  ['klimmzug.png',         SRC1, { left: 790, top: 520, width: 420, height: 460 }],
  ['langhantelrudern.png', SRC2, { left: 0,   top: 40,  width: 770, height: 460 }],
  ['ausfallschritt.png',   SRC2, { left: 790, top: 40,  width: 740, height: 470 }],
  ['bizeps-curl.png',      SRC2, { left: 20,  top: 500, width: 460, height: 510 }],
  ['trizeps-druecken.png', SRC2, { left: 480, top: 500, width: 460, height: 510 }],
  ['plank.png',            SRC2, { left: 930, top: 650, width: 600, height: 340 }],
];

async function crop(name, src, box) {
  const out = join(outDir, name);
  const meta = await sharp(src).metadata();
  const b = {
    left: Math.max(0, Math.round(box.left)),
    top: Math.max(0, Math.round(box.top)),
    width: Math.min(Math.round(box.width), meta.width - Math.max(0, Math.round(box.left))),
    height: Math.min(Math.round(box.height), meta.height - Math.max(0, Math.round(box.top))),
  };
  await sharp(src)
    .extract(b)
    .flatten({ background: '#ffffff' })
    .resize(700, 700, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(out);
  return out;
}

for (const [name, src, box] of jobs) {
  try { await crop(name, src, box); console.log('cropped', name); }
  catch (e) { const m = await sharp(src).metadata(); console.log('FAIL', name, 'box=', JSON.stringify(box), 'img=', m.width + 'x' + m.height, '->', e.message); }
}

// Build a review montage (5 cols x 2 rows)
const cell = 300, cols = 5, rows = 2, pad = 6;
const W = cols * cell + (cols + 1) * pad, H = rows * cell + (rows + 1) * pad;
const composites = [];
for (let i = 0; i < jobs.length; i++) {
  const thumb = await sharp(join(outDir, jobs[i][0])).resize(cell, cell, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
  const c = i % cols, r = Math.floor(i / cols);
  composites.push({ input: thumb, left: pad + c * (cell + pad), top: pad + r * (cell + pad) });
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#e5e5e5' } })
  .composite(composites)
  .png()
  .toFile(join(root, 'store', 'exercise-montage.png'));
console.log('montage done');
