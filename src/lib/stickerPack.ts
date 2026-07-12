// ---------------------------------------------------------------------------
// Procedural sticker starter pack — washi tape, torn paper scraps, light
// leaks, and marker doodles generated at runtime as PNG blobs. All original,
// deterministic, zero bundled assets.
// ---------------------------------------------------------------------------

import { seededRandom } from './autoLayout';
import { tornEdgePath, tracePath } from './frameStyles';

export interface GeneratedSticker {
  name: string;
  blob: Blob;
}

type Ctx = OffscreenCanvasRenderingContext2D;

function make(w: number, h: number): { canvas: OffscreenCanvas; ctx: Ctx } {
  const canvas = new OffscreenCanvas(w, h);
  return { canvas, ctx: canvas.getContext('2d')! };
}

async function toPng(canvas: OffscreenCanvas): Promise<Blob> {
  return canvas.convertToBlob({ type: 'image/png' });
}

// --- washi tape ----------------------------------------------------------------

async function washiTape(
  base: string,
  accent: string,
  pattern: 'stripes' | 'dots' | 'plain',
  seed: number,
): Promise<Blob> {
  const w = 640;
  const h = 176;
  const { canvas, ctx } = make(w, h);
  const rand = seededRandom(seed);

  // slightly ragged tape ends
  ctx.beginPath();
  ctx.moveTo(14 + rand() * 8, 0);
  for (let y = 0; y <= h; y += 22) ctx.lineTo(6 + rand() * 14, y);
  for (let x = 0; x <= w; x += 40) ctx.lineTo(x, h - 2);
  for (let y = h; y >= 0; y -= 22) ctx.lineTo(w - 6 - rand() * 14, y);
  ctx.lineTo(14, 0);
  ctx.closePath();
  ctx.clip();

  ctx.globalAlpha = 0.82;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = accent;
  if (pattern === 'stripes') {
    ctx.globalAlpha = 0.5;
    for (let x = -h; x < w + h; x += 56) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(Math.PI / 5);
      ctx.fillRect(0, -h, 22, h * 3);
      ctx.restore();
    }
  } else if (pattern === 'dots') {
    ctx.globalAlpha = 0.55;
    for (let x = 36; x < w; x += 72) {
      for (let y = 30; y < h; y += 58) {
        ctx.beginPath();
        ctx.arc(x + (rand() - 0.5) * 6, y + (rand() - 0.5) * 6, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // sheen
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h / 3);
  return toPng(canvas);
}

// --- torn paper scrap ---------------------------------------------------------

async function paperScrap(color: string, seed: string): Promise<Blob> {
  const w = 520;
  const h = 400;
  const { canvas, ctx } = make(w, h);
  const pts = tornEdgePath(w - 16, h - 16, seed);
  ctx.translate(8, 8);
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  tracePath(ctx, pts);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // paper texture: faint deterministic speckle
  const rand = seededRandom(97);
  tracePath(ctx, pts);
  ctx.clip();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000000';
  for (let i = 0; i < 900; i++) {
    ctx.fillRect(rand() * w, rand() * h, 2, 2);
  }
  return toPng(canvas);
}

// --- light leak -----------------------------------------------------------------

async function lightLeak(hueA: string, hueB: string): Promise<Blob> {
  const w = 900;
  const h = 600;
  const { canvas, ctx } = make(w, h);
  const g1 = ctx.createRadialGradient(w * 0.2, h * 0.3, 0, w * 0.2, h * 0.3, w * 0.55);
  g1.addColorStop(0, hueA);
  g1.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);
  const g2 = ctx.createRadialGradient(w * 0.85, h * 0.8, 0, w * 0.85, h * 0.8, w * 0.5);
  g2.addColorStop(0, hueB);
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  return toPng(canvas);
}

// --- marker doodles ---------------------------------------------------------------

function markerStroke(ctx: Ctx, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

async function doodleArrow(color: string): Promise<Blob> {
  const { canvas, ctx } = make(420, 220);
  markerStroke(ctx, color, 16);
  ctx.beginPath();
  ctx.moveTo(28, 150);
  ctx.bezierCurveTo(120, 60, 240, 200, 380, 90);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(310, 74);
  ctx.lineTo(384, 88);
  ctx.lineTo(340, 148);
  ctx.stroke();
  return toPng(canvas);
}

async function doodleStar(color: string): Promise<Blob> {
  const { canvas, ctx } = make(300, 300);
  markerStroke(ctx, color, 14);
  const cx = 150;
  const cy = 158;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const r = i % 2 === 0 ? 118 : 52;
    const a = (i * Math.PI) / 5 - Math.PI / 2 + (i % 2 ? 0.06 : -0.04); // hand wobble
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  return toPng(canvas);
}

async function doodleHeart(color: string): Promise<Blob> {
  const { canvas, ctx } = make(300, 280);
  markerStroke(ctx, color, 15);
  ctx.beginPath();
  ctx.moveTo(150, 246);
  ctx.bezierCurveTo(30, 150, 52, 40, 148, 92);
  ctx.bezierCurveTo(244, 36, 274, 148, 150, 246);
  ctx.stroke();
  return toPng(canvas);
}

// --- sparkle / confetti ------------------------------------------------------

function fourPointStar(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const inner = r * 0.22;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : inner;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

async function sparkleTrio(color: string): Promise<Blob> {
  const { canvas, ctx } = make(360, 200);
  fourPointStar(ctx, 110, 100, 78, color);
  fourPointStar(ctx, 250, 70, 46, color);
  fourPointStar(ctx, 280, 150, 30, color);
  return toPng(canvas);
}

async function confetti(seed: number): Promise<Blob> {
  const { canvas, ctx } = make(480, 480);
  const rand = seededRandom(seed);
  const colors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
  for (let i = 0; i < 46; i++) {
    ctx.save();
    ctx.translate(rand() * 480, rand() * 480);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const w = 10 + rand() * 14;
    ctx.fillRect(-w / 2, -w / 4, w, w / 2);
    ctx.restore();
  }
  return toPng(canvas);
}

async function starburst(color: string): Promise<Blob> {
  const { canvas, ctx } = make(360, 360);
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(180 + Math.cos(a) * 70, 180 + Math.sin(a) * 70);
    ctx.lineTo(180 + Math.cos(a) * 150, 180 + Math.sin(a) * 150);
    ctx.stroke();
  }
  return toPng(canvas);
}

// --- banners / tabs ----------------------------------------------------------

async function ribbon(fill: string, textColor: string): Promise<Blob> {
  const w = 620;
  const h = 200;
  const { canvas, ctx } = make(w, h);
  ctx.fillStyle = fill;
  // main bar
  ctx.fillRect(40, 60, w - 80, 80);
  // notched tails
  ctx.beginPath();
  ctx.moveTo(40, 60);
  ctx.lineTo(0, 100);
  ctx.lineTo(40, 140);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w - 40, 60);
  ctx.lineTo(w, 100);
  ctx.lineTo(w - 40, 140);
  ctx.closePath();
  ctx.fill();
  // subtle inner line
  ctx.strokeStyle = textColor;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  ctx.strokeRect(52, 74, w - 104, 52);
  return toPng(canvas);
}

async function speechBubble(fill: string): Promise<Blob> {
  const { canvas, ctx } = make(420, 340);
  ctx.fillStyle = fill;
  const r = 40;
  const w = 380;
  const h = 240;
  ctx.beginPath();
  ctx.moveTo(20 + r, 20);
  ctx.arcTo(20 + w, 20, 20 + w, 20 + h, r);
  ctx.arcTo(20 + w, 20 + h, 20, 20 + h, r);
  ctx.arcTo(20, 20 + h, 20, 20, r);
  ctx.arcTo(20, 20, 20 + w, 20, r);
  ctx.closePath();
  ctx.fill();
  // tail
  ctx.beginPath();
  ctx.moveTo(120, 20 + h - 4);
  ctx.lineTo(90, 320);
  ctx.lineTo(190, 20 + h - 4);
  ctx.closePath();
  ctx.fill();
  return toPng(canvas);
}

async function badgeBurst(fill: string, ring: string): Promise<Blob> {
  const { canvas, ctx } = make(340, 340);
  const cx = 170;
  const cy = 170;
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    const rad = i % 2 === 0 ? 150 : 120;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, 96, 0, Math.PI * 2);
  ctx.stroke();
  return toPng(canvas);
}

// --- emoji -------------------------------------------------------------------

/** Render a system emoji glyph to a transparent PNG (color-font dependent). */
export async function emojiSticker(emoji: string): Promise<Blob> {
  const size = 256;
  const { canvas, ctx } = make(size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.8)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  return toPng(canvas);
}

// --- packs ---------------------------------------------------------------------

export async function generateStarterPack(): Promise<GeneratedSticker[]> {
  const [
    washiPeach,
    washiBlue,
    washiKraft,
    scrapWhite,
    scrapKraft,
    leakWarm,
    leakCool,
    arrow,
    star,
    heart,
  ] = await Promise.all([
    washiTape('#f9c8b8', '#e98a6f', 'stripes', 11),
    washiTape('#bcd9e8', '#5f93b8', 'dots', 22),
    washiTape('#d9c7a8', '#a98e63', 'plain', 33),
    paperScrap('#fbfaf6', 'scrap-white'),
    paperScrap('#e5d5b5', 'scrap-kraft'),
    lightLeak('rgba(255,120,50,0.55)', 'rgba(255,60,90,0.4)'),
    lightLeak('rgba(120,180,255,0.5)', 'rgba(200,120,255,0.35)'),
    doodleArrow('#e8503a'),
    doodleStar('#e0a930'),
    doodleHeart('#d4526e'),
  ]);
  return [
    { name: 'Washi · peach stripes.png', blob: washiPeach },
    { name: 'Washi · blue dots.png', blob: washiBlue },
    { name: 'Washi · kraft.png', blob: washiKraft },
    { name: 'Torn paper · white.png', blob: scrapWhite },
    { name: 'Torn paper · kraft.png', blob: scrapKraft },
    { name: 'Light leak · warm.png', blob: leakWarm },
    { name: 'Light leak · cool.png', blob: leakCool },
    { name: 'Doodle · arrow.png', blob: arrow },
    { name: 'Doodle · star.png', blob: star },
    { name: 'Doodle · heart.png', blob: heart },
  ];
}

export async function generateSparklePack(): Promise<GeneratedSticker[]> {
  const [sGold, sWhite, sPink, conf, burstY, burstC] = await Promise.all([
    sparkleTrio('#facc15'),
    sparkleTrio('#ffffff'),
    sparkleTrio('#f472b6'),
    confetti(7),
    starburst('#fbbf24'),
    starburst('#22d3ee'),
  ]);
  return [
    { name: 'Sparkle · gold.png', blob: sGold },
    { name: 'Sparkle · white.png', blob: sWhite },
    { name: 'Sparkle · pink.png', blob: sPink },
    { name: 'Confetti.png', blob: conf },
    { name: 'Starburst · amber.png', blob: burstY },
    { name: 'Starburst · cyan.png', blob: burstC },
  ];
}

export async function generateBannerPack(): Promise<GeneratedSticker[]> {
  const [ribRed, ribBlue, bubble, badge] = await Promise.all([
    ribbon('#e11d48', '#fff1f2'),
    ribbon('#2563eb', '#eff6ff'),
    speechBubble('#ffffff'),
    badgeBurst('#f59e0b', '#78350f'),
  ]);
  return [
    { name: 'Ribbon · red.png', blob: ribRed },
    { name: 'Ribbon · blue.png', blob: ribBlue },
    { name: 'Speech bubble.png', blob: bubble },
    { name: 'Badge burst.png', blob: badge },
  ];
}

export const STICKER_PACKS: { key: string; label: string; make: () => Promise<GeneratedSticker[]> }[] = [
  { key: 'starter', label: '✨ Scrapbook', make: generateStarterPack },
  { key: 'sparkle', label: '⭐ Sparkle', make: generateSparklePack },
  { key: 'banner', label: '🎀 Banners', make: generateBannerPack },
];
