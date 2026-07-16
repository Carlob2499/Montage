// ---------------------------------------------------------------------------
// Focal point detection (pure): where is the subject? Prefer the largest
// detected face; otherwise fall back to a saliency centroid (gradient-magnitude
// weighted) on a downsampled gray grid. Returns a normalized point (0..1) used
// to bias automated crops and Ken Burns so montages frame their subject instead
// of dead-centering. Computed off the 320px thumb, cached on PhotoScores.focal.
// ---------------------------------------------------------------------------

import type { Pixels } from './pixels';
import { grayGrid } from './pixels';

export interface FocalPoint {
  x: number;
  y: number;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp01 = (v: number, lo = 0.08, hi = 0.92) => Math.min(hi, Math.max(lo, v));

/** center of the largest face box (normalized), or null when there are none */
export function faceFocal(faces?: FaceBox[]): FocalPoint | null {
  if (!faces || !faces.length) return null;
  let best = faces[0];
  for (const f of faces) if (f.width * f.height > best.width * best.height) best = f;
  return { x: clamp01(best.x + best.width / 2), y: clamp01(best.y + best.height / 2) };
}

/**
 * Saliency focal: the gradient-magnitude centroid of a downsampled gray grid —
 * a cheap "where's the detail/subject" estimate. Eased toward center so a busy
 * edge doesn't yank the crop to the border. Pure.
 */
export function saliencyFocal(px: Pixels, size = 32): FocalPoint {
  const g = grayGrid(px, size);
  let sumW = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const gx = g[y * size + x + 1] - g[y * size + x - 1];
      const gy = g[(y + 1) * size + x] - g[(y - 1) * size + x];
      const mag = Math.abs(gx) + Math.abs(gy);
      sumW += mag;
      sx += mag * (x + 0.5);
      sy += mag * (y + 0.5);
    }
  }
  if (sumW <= 1e-6) return { x: 0.5, y: 0.5 };
  let fx = sx / sumW / size;
  let fy = sy / sumW / size;
  fx = 0.5 + (fx - 0.5) * 0.85;
  fy = 0.5 + (fy - 0.5) * 0.85;
  return { x: clamp01(fx), y: clamp01(fy) };
}

/** face center if any, else saliency centroid. Pure. */
export function computeFocal(px: Pixels, faces?: FaceBox[]): FocalPoint {
  return faceFocal(faces) ?? saliencyFocal(px);
}
