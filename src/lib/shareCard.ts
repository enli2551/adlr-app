import { Capacitor } from '@capacitor/core';
import { t, fmtDate, fmtNum } from '@/lib/i18n';

// Shareable story cards (1080×1920 PNG, Instagram/WhatsApp story format), drawn on a
// canvas — no network, no extra libs. Always the dark brand look, whatever the theme.
// The coach's name sits on the card: every share is a small ad for the trainer.

const W = 1080, H = 1920;
const GOLD = '#C9A84C', FG = '#EDEAE0', MUTED = '#9a958a', BG = '#0A0A0A';
const FONT = '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';

export interface ShareStat { label: string; value: string }
export interface ShareCardData {
  kicker: string;          // e.g. "TRAINING #24"
  title: string;           // workout name / headline
  date: Date;
  stats: ShareStat[];      // up to 4 big numbers
  highlight?: { label: string; lines: string[] }; // e.g. new records
  list?: { label: string; lines: [string, string][] }; // e.g. exercises → best set
  coach?: string | null;   // "Coach: Peter"
}

function logo(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  // Same paths as components/Logo.tsx (viewBox 200×50).
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
  ctx.stroke(new Path2D('M6 46 L20 6 Q26 2 30 6 L44 46'));
  ctx.globalAlpha = 0.7; ctx.lineWidth = 2.5;
  ctx.stroke(new Path2D('M14 30 Q27 24 36 30'));
  ctx.globalAlpha = 1; ctx.strokeStyle = FG; ctx.lineWidth = 3;
  ctx.stroke(new Path2D('M52 6 L52 44 Q72 44 72 25 Q72 6 52 6'));
  ctx.stroke(new Path2D('M82 6 L82 44 L108 44'));
  ctx.stroke(new Path2D('M118 6 L118 44 M118 6 L140 6 Q150 6 150 16 Q150 26 140 26 L118 26 M134 26 L150 44'));
  ctx.restore();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 700): number {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 4; } while (ctx.measureText(text).width > maxW && s > 28);
  return s + 4;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawShareCard(d: ShareCardData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;

  // Background: near-black with a soft gold glow top-right.
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 220, 20, W * 0.85, 220, 900);
  glow.addColorStop(0, 'rgba(201,168,76,0.28)'); glow.addColorStop(1, 'rgba(201,168,76,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  const X = 90;
  logo(ctx, X, 120, 2.2);

  let y = 360;
  ctx.fillStyle = GOLD; ctx.font = `600 34px ${FONT}`;
  ctx.fillText(d.kicker.toUpperCase().split('').join(' '), X, y);
  y += 30;
  const tSize = fitText(ctx, d.title, W - 2 * X, 92);
  ctx.fillStyle = FG; ctx.font = `800 ${tSize}px ${FONT}`;
  y += tSize; ctx.fillText(d.title, X, y);
  y += 60;
  ctx.fillStyle = MUTED; ctx.font = `400 36px ${FONT}`;
  ctx.fillText(fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), X, y);

  // Stats grid: 3 → one row of three, otherwise 2 per row
  y += 80;
  const stats = d.stats.slice(0, 4);
  const cols = stats.length === 3 ? 3 : 2;
  const cellW = (W - 2 * X - 30 * (cols - 1)) / cols, cellH = 230;
  stats.forEach((s, i) => {
    const cx = X + (i % cols) * (cellW + 30), cy = y + Math.floor(i / cols) * (cellH + 30);
    roundRect(ctx, cx, cy, cellW, cellH, 36);
    ctx.fillStyle = 'rgba(237,234,224,0.05)'; ctx.fill();
    ctx.strokeStyle = 'rgba(237,234,224,0.10)'; ctx.lineWidth = 2; ctx.stroke();
    const vs = fitText(ctx, s.value, cellW - 80, 88, 800);
    ctx.fillStyle = FG; ctx.font = `800 ${vs}px ${FONT}`;
    ctx.fillText(s.value, cx + 40, cy + 70 + vs * 0.8);
    ctx.fillStyle = MUTED; ctx.font = `500 34px ${FONT}`;
    ctx.fillText(s.label, cx + 40, cy + cellH - 44);
  });
  y += Math.ceil(stats.length / cols) * (cellH + 30) + 30;

  if (d.highlight && d.highlight.lines.length) {
    const lines = d.highlight.lines.slice(0, 4);
    const h = 110 + lines.length * 62;
    roundRect(ctx, X, y, W - 2 * X, h, 36);
    ctx.fillStyle = 'rgba(201,168,76,0.12)'; ctx.fill();
    ctx.strokeStyle = 'rgba(201,168,76,0.55)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = `700 32px ${FONT}`;
    ctx.fillText(d.highlight.label.toUpperCase(), X + 44, y + 72);
    ctx.fillStyle = FG; ctx.font = `700 42px ${FONT}`;
    lines.forEach((l, i) => { fitText(ctx, l, W - 2 * X - 88, 42); ctx.fillText(l, X + 44, y + 140 + i * 62); });
    y += h + 40;
  }

  const room = Math.max(0, Math.floor((H - 260 - y - 60) / 64));
  if (d.list && d.list.lines.length && room > 0) {
    ctx.fillStyle = MUTED; ctx.font = `600 32px ${FONT}`;
    ctx.fillText(d.list.label.toUpperCase(), X, y + 30);
    y += 60;
    d.list.lines.slice(0, Math.min(6, room)).forEach(([a, b]) => {
      y += 64;
      ctx.fillStyle = FG; ctx.font = `500 40px ${FONT}`;
      ctx.textAlign = 'right'; const bw = ctx.measureText(b).width; ctx.fillText(b, W - X, y); ctx.textAlign = 'left';
      fitText(ctx, a, W - 2 * X - bw - 40, 40, 500);
      ctx.fillStyle = 'rgba(237,234,224,0.85)'; ctx.fillText(a, X, y);
    });
  }

  // Footer
  ctx.fillStyle = 'rgba(237,234,224,0.10)'; ctx.fillRect(X, H - 200, W - 2 * X, 2);
  ctx.fillStyle = MUTED; ctx.font = `500 34px ${FONT}`;
  ctx.fillText(d.coach ? t('Coach: {coach}', { coach: d.coach }) : 'ADLR', X, H - 120);
  ctx.textAlign = 'right'; ctx.fillStyle = GOLD; ctx.font = `600 30px ${FONT}`;
  ctx.fillText(t('Steig auf. Bleib stark.').toUpperCase(), W - X, H - 120);
  ctx.textAlign = 'left';
  return c;
}

/** Native share sheet (Android/iOS) with the PNG, Web Share on browsers, download as last resort. */
export async function shareCanvas(canvas: HTMLCanvasElement, fileName: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const dataUrl = canvas.toDataURL('image/png');
  try {
    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const res = await Filesystem.writeFile({ path: fileName, data: dataUrl.split(',')[1], directory: Directory.Cache });
      await Share.share({ files: [res.uri], text, dialogTitle: t('Teilen') });
      return 'shared';
    }
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof Error && /cancel|abort/i.test(e.message + e.name)) return 'cancelled';
  }
  const a = document.createElement('a');
  a.href = dataUrl; a.download = fileName; a.click();
  return 'downloaded';
}

export const fmtVolume = (kg: number) => (kg >= 10000 ? `${fmtNum(Math.round(kg / 100) / 10)} t` : `${fmtNum(Math.round(kg))} kg`);
