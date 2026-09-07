import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'exercises');
const SRC = 'D:/DEV/claude/übungen2.png';

// 5-col x 2-row grid, each cell has 2 stacked positions. Skip #8 and #10 (bad output).
// col width 307.2, row height 512. Inset drops number label.
const C = 307.2, R = 512, INS_L = 10, INS_T = 38, W = 287, H = 458;
const cell = (col, row) => ({ left: Math.round(col * C + INS_L), top: Math.round(row * R + INS_T), width: W, height: H });

const jobs = [
  ['kurzhantel-bankdruecken.png',   cell(0, 0)], // 1
  ['kurzhantel-schulterdruecken.png', cell(1, 0)], // 2
  ['kurzhantel-rudern.png',         cell(2, 0)], // 3
  ['rumaenisches-kreuzheben.png',   cell(3, 0)], // 4
  ['hip-thrust.png',                cell(4, 0)], // 5
  ['reverse-fly.png',               cell(0, 1)], // 6
  ['hammercurls.png',               cell(1, 1)], // 7
  ['dips.png',                      cell(3, 1)], // 9  (skip col2=#8)
];

for (const [name, box] of jobs) {
  await sharp(SRC).extract(box).flatten({ background: '#ffffff' })
    .resize(700, 700, { fit: 'contain', background: '#ffffff' }).png().toFile(join(outDir, name));
  console.log('cropped', name);
}

const cs = 300, cols = 4, rows = 2, pad = 6;
const MW = cols * cs + (cols + 1) * pad, MH = rows * cs + (rows + 1) * pad;
const comp = [];
for (let i = 0; i < jobs.length; i++) {
  const t = await sharp(join(outDir, jobs[i][0])).resize(cs, cs, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
  comp.push({ input: t, left: pad + (i % cols) * (cs + pad), top: pad + Math.floor(i / cols) * (cs + pad) });
}
await sharp({ create: { width: MW, height: MH, channels: 3, background: '#e5e5e5' } }).composite(comp).png().toFile(join(root, 'store', 'exercise-montage3.png'));
console.log('montage done');
