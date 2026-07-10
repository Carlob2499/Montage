// ---------------------------------------------------------------------------
// Scrapbook frame-style geometry — pure and deterministic (seeded from the
// layer id) so the Konva preview and the export renderer draw EXACTLY the
// same shapes. All coordinates are in layer-local space.
// ---------------------------------------------------------------------------

import { seededRandom } from './autoLayout';

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- polaroid ---------------------------------------------------------------

export interface PolaroidMetrics {
  /** even border on top/left/right */
  border: number;
  /** classic thick bottom chin */
  chin: number;
}

export function polaroidMetrics(w: number, h: number): PolaroidMetrics {
  const base = Math.min(w, h);
  return { border: Math.round(base * 0.045), chin: Math.round(base * 0.16) };
}

/** where the photo pixels live inside a framed layer (layer-local) */
export function frameContentRect(
  style: 'polaroid' | 'tape' | 'torn' | undefined,
  w: number,
  h: number,
): { x: number; y: number; width: number; height: number } {
  if (style === 'polaroid') {
    const m = polaroidMetrics(w, h);
    return {
      x: m.border,
      y: m.border,
      width: Math.max(1, w - 2 * m.border),
      height: Math.max(1, h - m.border - m.chin),
    };
  }
  return { x: 0, y: 0, width: w, height: h };
}

// --- washi tape ----------------------------------------------------------------

export interface TapeStrip {
  /** center of the strip */
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number; // degrees
}

/** two translucent strips across the top corners */
export function tapeStrips(w: number, h: number, seed: string): TapeStrip[] {
  const rand = seededRandom(hashSeed(seed));
  const len = Math.min(w, h) * (0.32 + rand() * 0.08);
  const thick = len * 0.32;
  return [
    {
      cx: w * 0.08,
      cy: h * 0.04,
      width: len,
      height: thick,
      rotation: -38 - rand() * 10,
    },
    {
      cx: w * 0.92,
      cy: h * 0.04,
      width: len,
      height: thick,
      rotation: 38 + rand() * 10,
    },
  ];
}

// --- torn edge ----------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

/**
 * Deterministic torn-paper outline: a closed polygon following the rect with
 * jagged displacement on every edge. Displacement stays within `depth` px
 * INSIDE the rect so the shape always clips (never spills outside the layer).
 */
export function tornEdgePath(w: number, h: number, seed: string): Point[] {
  const rand = seededRandom(hashSeed(seed));
  const depth = Math.max(3, Math.min(w, h) * 0.035);
  const step = Math.max(8, Math.min(w, h) / 14);
  const pts: Point[] = [];

  const jag = () => rand() * depth;

  // top edge (left → right)
  for (let x = 0; x <= w; x += step) pts.push({ x: Math.min(x, w), y: jag() });
  // right edge (top → bottom)
  for (let y = step; y <= h; y += step) pts.push({ x: w - jag(), y: Math.min(y, h) });
  // bottom edge (right → left)
  for (let x = w - step; x >= 0; x -= step) pts.push({ x: Math.max(x, 0), y: h - jag() });
  // left edge (bottom → top)
  for (let y = h - step; y >= step; y -= step) pts.push({ x: jag(), y: Math.max(y, 0) });

  return pts;
}

/** trace a point list as a closed path on any 2D context */
export function tracePath(
  ctx: { beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void },
  pts: Point[],
): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}
