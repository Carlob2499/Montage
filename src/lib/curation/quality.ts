// ---------------------------------------------------------------------------
// Cheap per-photo quality metrics (pure). Run on the 320px thumbnail:
//   sharpness   — Laplacian-variance (blurry shots score low)
//   exposure    — histogram spread (penalize clipped/crushed/flat)
//   colorfulness— Hasler–Süsstrunk metric
// combined into a 0..1 composite with a small bonus for detected faces.
// ---------------------------------------------------------------------------

import type { Pixels } from './pixels';
import { grayGrid, luma } from './pixels';

/** soft saturating map to 0..1 */
const soft = (v: number, k: number) => 1 - Math.exp(-v / k);

/**
 * Laplacian-variance sharpness on a downsampled grayscale grid, normalized to
 * 0..1. A blurred image has little high-frequency energy → low variance.
 */
export function sharpness(px: Pixels): number {
  const N = 48;
  const g = grayGrid(px, N);
  let mean = 0;
  const lap = new Float64Array(N * N);
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - N] - g[i + N];
      lap[i] = v;
      mean += v;
    }
  }
  const inner = (N - 2) * (N - 2);
  mean /= inner;
  let varsum = 0;
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const d = lap[y * N + x] - mean;
      varsum += d * d;
    }
  }
  const variance = varsum / inner;
  // typical in-focus thumbnails land in the hundreds; K tuned so ~150 → ~0.6
  return soft(variance, 200);
}

/**
 * Exposure quality from the luma histogram: 1 for a well-spread mid-key image,
 * penalizing blown highlights, crushed shadows, and low overall contrast.
 */
export function exposure(px: Pixels): number {
  const { data, width, height } = px;
  const hist = new Float64Array(256);
  const total = width * height;
  const step = Math.max(1, Math.floor(total / 20000));
  let n = 0;
  let sum = 0;
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    const y = luma(data[i], data[i + 1], data[i + 2]);
    hist[Math.min(255, Math.max(0, Math.round(y)))]++;
    sum += y;
    n++;
  }
  if (!n) return 0;
  const mean = sum / n;
  // clipping: mass in the extreme 4% of the range
  let clipLow = 0;
  let clipHigh = 0;
  for (let v = 0; v <= 10; v++) clipLow += hist[v];
  for (let v = 245; v <= 255; v++) clipHigh += hist[v];
  const clip = (clipLow + clipHigh) / n;
  // contrast: stddev of luma (flat images look dull)
  let varsum = 0;
  for (let v = 0; v < 256; v++) {
    const d = v - mean;
    varsum += hist[v] * d * d;
  }
  const std = Math.sqrt(varsum / n);
  const midKey = 1 - Math.abs(mean - 128) / 128; // 1 at mid-grey
  const contrast = Math.min(1, std / 60); // ~60 std reads as punchy
  const clipPenalty = Math.max(0, 1 - clip * 4); // 25% clipped → 0
  return Math.max(0, Math.min(1, 0.45 * midKey + 0.35 * contrast + 0.2 * clipPenalty));
}

/**
 * Hasler–Süsstrunk colorfulness, normalized to 0..1. Grey/monochrome → ~0,
 * saturated scenes → ~1.
 */
export function colorfulness(px: Pixels): number {
  const { data, width, height } = px;
  const total = width * height;
  const step = Math.max(1, Math.floor(total / 20000));
  let sumRg = 0;
  let sumYb = 0;
  let sumRg2 = 0;
  let sumYb2 = 0;
  let n = 0;
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    sumRg += rg;
    sumYb += yb;
    sumRg2 += rg * rg;
    sumYb2 += yb * yb;
    n++;
  }
  if (!n) return 0;
  const meanRg = sumRg / n;
  const meanYb = sumYb / n;
  const stdRg = Math.sqrt(Math.max(0, sumRg2 / n - meanRg * meanRg));
  const stdYb = Math.sqrt(Math.max(0, sumYb2 / n - meanYb * meanYb));
  const stdRoot = Math.sqrt(stdRg * stdRg + stdYb * stdYb);
  const meanRoot = Math.sqrt(meanRg * meanRg + meanYb * meanYb);
  const metric = stdRoot + 0.3 * meanRoot; // 0..~150 in practice
  return Math.min(1, metric / 110);
}

export interface QualityScore {
  quality: number;
  sharpness: number;
  exposure: number;
  colorfulness: number;
}

/**
 * Composite pick-worthiness. Sharpness dominates (blurry shots are the main
 * thing to reject), then exposure, with a light colorfulness nudge and a small
 * bonus when faces are present (people shots read as keepers).
 */
export function qualityScore(px: Pixels, faceCount = 0): QualityScore {
  const s = sharpness(px);
  const e = exposure(px);
  const c = colorfulness(px);
  const faceBonus = Math.min(0.12, faceCount * 0.06);
  const quality = Math.max(0, Math.min(1, 0.5 * s + 0.3 * e + 0.2 * c + faceBonus));
  return { quality, sharpness: s, exposure: e, colorfulness: c };
}
