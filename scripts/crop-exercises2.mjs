import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'exercises');
const SRC = 'D:/DEV/claude/übungen1.png';

// 4-col x 3-row grid (row 3 has 2 double-wide cells). Insets drop the number label + gridlines.
const jobs = [
  ['schraegbankdruecken.png', { left: 14,   top: 40,  width: 356, height: 296 }],
  ['latzug.png',              { left: 398,  top: 40,  width: 356, height: 296 }],
  ['sitzrudern.png',          { left: 782,  top: 40,  width: 356, height: 296 }],
  ['beinpresse.png',          { left: 1166, top: 40,  width: 356, height: 296 }],
  ['beinstrecker.png',        { left: 14,   top: 381, width: 356, height: 296 }],
  ['beinbeuger.png',          { left: 398,  top: 381, width: 356, height: 296 }],
  ['wadenheben.png',          { left: 782,  top: 381, width: 356, height: 296 }],
  ['seitheben.png',           { left: 1166, top: 381, width: 356, height: 296 }],
  ['kabel-fliegende.png',     { left: 14,   top: 723, width: 740, height: 296 }],
  ['crunches.png',            { left: 782,  top: 723, width: 740, height: 296 }],
];

for (const [name, box] of jobs) {
  await sharp(SRC).extract(box).flatten({ background: '#ffffff' })
    .resize(700, 700, { fit: 'contain', background: '#ffffff' }).png()
    .toFile(join(outDir, name));
  console.log('cropped', name);
}

// Review montage (5 x 2)
const cell = 300, cols = 5, rows = 2, pad = 6;
const W = cols * cell + (cols + 1) * pad, H = rows * cell + (rows + 1) * pad;
const comp = [];
for (let i = 0; i < jobs.length; i++) {
  const thumb = await sharp(join(outDir, jobs[i][0])).resize(cell, cell, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
  comp.push({ input: thumb, left: pad + (i % cols) * (cell + pad), top: pad + Math.floor(i / cols) * (cell + pad) });
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#e5e5e5' } }).composite(comp).png().toFile(join(root, 'store', 'exercise-montage2.png'));
console.log('montage done');
