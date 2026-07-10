// ---------------------------------------------------------------------------
// Non-destructive edit stack: pure pixel math applied to RGBA buffers.
// The same function is used as a Konva custom filter (via applyAdjustments on
// ImageData) and by the unit tests. Originals are never touched — the stack
// is just parameters stored per photo.
// ---------------------------------------------------------------------------

import { NEUTRAL_ADJUSTMENTS } from '../types';
import type { Adjustments, EditStack } from '../types';

export function neutralStack(): EditStack {
  return { adjustments: { ...NEUTRAL_ADJUSTMENTS } };
}

export function isNeutral(adj: Adjustments): boolean {
  return (Object.keys(NEUTRAL_ADJUSTMENTS) as (keyof Adjustments)[]).every(
    (k) => adj[k] === 0,
  );
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Rec. 601 luma. */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Apply the color adjustments (everything except the spatial ones —
 * sharpness and vignette) to a single RGB pixel. Exported for tests.
 */
export function adjustPixel(
  r: number,
  g: number,
  b: number,
  adj: Adjustments,
): [number, number, number] {
  // exposure: ±100 → ±2 stops
  if (adj.exposure !== 0) {
    const f = Math.pow(2, adj.exposure / 50);
    r *= f;
    g *= f;
    b *= f;
  }

  // temperature: warm shifts red up / blue down, cool the reverse
  if (adj.temperature !== 0) {
    const t = (adj.temperature / 100) * 40;
    r += t;
    b -= t;
  }

  // tint: positive → magenta (drop green), negative → green
  if (adj.tint !== 0) {
    const t = (adj.tint / 100) * 40;
    g -= t;
    r += t * 0.4;
    b += t * 0.4;
  }

  // highlights / shadows: luminance-weighted lift/compress
  if (adj.highlights !== 0 || adj.shadows !== 0) {
    const l = luma(r, g, b) / 255;
    // smooth weights: shadows act below mid, highlights above
    const shadowW = Math.pow(Math.max(0, 1 - l * 2), 1.5);
    const highW = Math.pow(Math.max(0, l * 2 - 1), 1.5);
    const shift =
      (adj.shadows / 100) * 80 * shadowW + (adj.highlights / 100) * 80 * highW;
    r += shift;
    g += shift;
    b += shift;
  }

  // contrast: pivot around mid gray
  if (adj.contrast !== 0) {
    const k = 1 + adj.contrast / 100;
    r = (r - 128) * k + 128;
    g = (g - 128) * k + 128;
    b = (b - 128) * k + 128;
  }

  // saturation & vibrance
  if (adj.saturation !== 0 || adj.vibrance !== 0) {
    const l = luma(r, g, b);
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const satNow = maxC === 0 ? 0 : (maxC - minC) / 255;
    // vibrance boosts less-saturated pixels more
    const vib = (adj.vibrance / 100) * (1 - satNow);
    const s = 1 + adj.saturation / 100 + vib;
    r = l + (r - l) * s;
    g = l + (g - l) * s;
    b = l + (b - l) * s;
  }

  return [clamp255(r), clamp255(g), clamp255(b)];
}

/**
 * Apply the full adjustment set to an RGBA buffer in place.
 * `width`/`height` are needed for the spatial effects (sharpness, vignette).
 */
export function applyAdjustments(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  adj: Adjustments,
): void {
  if (isNeutral(adj)) return;

  const hasColor =
    adj.exposure !== 0 ||
    adj.contrast !== 0 ||
    adj.highlights !== 0 ||
    adj.shadows !== 0 ||
    adj.saturation !== 0 ||
    adj.vibrance !== 0 ||
    adj.temperature !== 0 ||
    adj.tint !== 0;

  if (hasColor) {
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = adjustPixel(data[i], data[i + 1], data[i + 2], adj);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  if (adj.sharpness > 0) sharpen(data, width, height, adj.sharpness / 100);
  if (adj.vignette > 0) vignette(data, width, height, adj.vignette / 100);
}

/** Unsharp-mask style 3×3 sharpen, amount 0..1. */
function sharpen(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): void {
  const src = new Uint8ClampedArray(data);
  const a = amount * 0.8;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = src[i + c];
        const blur =
          (src[i + c - 4] +
            src[i + c + 4] +
            src[i + c - width * 4] +
            src[i + c + width * 4]) /
          4;
        data[i + c] = clamp255(center + (center - blur) * a * 2);
      }
    }
  }
}

/** Radial darkening toward the corners, amount 0..1. */
function vignette(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): void {
  const cx = width / 2;
  const cy = height / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / maxD;
      // no effect in the center ~40%, ease toward corners
      const t = Math.max(0, (d - 0.4) / 0.6);
      const dark = 1 - amount * t * t * 0.85;
      const i = (y * width + x) * 4;
      data[i] *= dark;
      data[i + 1] *= dark;
      data[i + 2] *= dark;
    }
  }
}

/**
 * Copy an edit stack for pasting onto other photos (batch consistency).
 * Crop is intentionally not carried over — it is photo-specific.
 */
export function copyStackForPaste(stack: EditStack): EditStack {
  return { adjustments: { ...stack.adjustments }, presetId: stack.presetId };
}

/** Merge a preset's adjustments over a stack, keeping the photo's crop. */
export function applyPresetToStack(
  stack: EditStack,
  presetAdjustments: Adjustments,
  presetId: string,
): EditStack {
  return { ...stack, adjustments: { ...presetAdjustments }, presetId };
}
