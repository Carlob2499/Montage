// ---------------------------------------------------------------------------
// First-run demo: synthesize a small "sample trip" (6 distinct vibey scenes) as
// real JPEG Files, so a brand-new user with no photos can tap one button and
// watch the whole Auto Montage → reel flow work in seconds. Generated on the
// fly (no bundled photo assets, stays offline); each scene differs enough in
// palette + composition that curation keeps them all and detects a vibe.
// ---------------------------------------------------------------------------

import { makeCanvas, canvasToBlob } from '../imageUtils';

interface Scene {
  name: string;
  sky: [string, string];
  sun: string;
  sunX: number;
  sunY: number;
  hills: string;
  haze: string;
}

const SCENES: Scene[] = [
  { name: 'golden-hour', sky: ['#ffd59e', '#ff7e5f'], sun: '#fff4d6', sunX: 0.72, sunY: 0.34, hills: '#5b2b39', haze: 'rgba(255,180,120,0.25)' },
  { name: 'blue-dusk', sky: ['#3a6ea5', '#1f2a44'], sun: '#dbeafe', sunX: 0.3, sunY: 0.28, hills: '#0d1626', haze: 'rgba(120,160,220,0.2)' },
  { name: 'forest', sky: ['#a7d5a0', '#2f7d51'], sun: '#f0ffe6', sunX: 0.5, sunY: 0.22, hills: '#123524', haze: 'rgba(120,200,140,0.2)' },
  { name: 'desert', sky: ['#f6d365', '#e08a3c'], sun: '#fff7e0', sunX: 0.64, sunY: 0.4, hills: '#7a3b1d', haze: 'rgba(240,200,120,0.25)' },
  { name: 'coast', sky: ['#8ec5fc', '#4a90d9'], sun: '#ffffff', sunX: 0.42, sunY: 0.3, hills: '#1a3b6b', haze: 'rgba(255,255,255,0.15)' },
  { name: 'berry-night', sky: ['#7c3aed', '#db2777'], sun: '#ffe0f0', sunX: 0.56, sunY: 0.32, hills: '#2a103f', haze: 'rgba(220,120,200,0.25)' },
];

const W = 1200;
const H = 900;

function drawScene(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, s: Scene, i: number): void {
  // sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, s.sky[0]);
  sky.addColorStop(1, s.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // sun / moon
  ctx.save();
  ctx.globalAlpha = 0.9;
  const g = ctx.createRadialGradient(s.sunX * W, s.sunY * H, 0, s.sunX * W, s.sunY * H, 220);
  g.addColorStop(0, s.sun);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = s.sun;
  ctx.beginPath();
  ctx.arc(s.sunX * W, s.sunY * H, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // layered hills (silhouettes) — position varies by scene index
  for (let layer = 0; layer < 3; layer++) {
    const baseY = H * (0.6 + layer * 0.12);
    const amp = 60 - layer * 12;
    const phase = (i + layer) * 1.3;
    ctx.fillStyle = layer === 2 ? s.hills : shade(s.hills, 0.15 * (2 - layer));
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 24) {
      const y = baseY + Math.sin(x / 160 + phase) * amp + Math.sin(x / 60 + phase * 2) * (amp / 3);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  // atmospheric haze band
  ctx.fillStyle = s.haze;
  ctx.fillRect(0, H * 0.5, W, H * 0.16);
}

/** lighten/darken a hex color toward white/black by `amt` (0..1) */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/** Generate the demo trip as JPEG Files ready for the import pipeline. */
export async function generateSampleFiles(): Promise<File[]> {
  const files: File[] = [];
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    const { canvas, ctx } = makeCanvas(W, H);
    drawScene(ctx as OffscreenCanvasRenderingContext2D, s, i);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    files.push(new File([blob], `sample-${i + 1}-${s.name}.jpg`, { type: 'image/jpeg' }));
  }
  return files;
}
