// ---------------------------------------------------------------------------
// Palette + "vibe" extraction (pure). Buckets sampled pixels into a coarse
// color histogram for the dominant swatches, and derives mean HSL stats to
// classify the photo's mood into a VibeLabel used for vibe-matched curation.
// ---------------------------------------------------------------------------

import type { VibeLabel } from '../../types';
import type { Pixels } from './pixels';
import { rgbToHex, rgbToHsl, samplePixels } from './pixels';

export interface PaletteResult {
  /** dominant swatches, most-dominant first (hex) */
  palette: string[];
  /** mean HSL, each 0..1 (hue 0..1 == 0..360°) */
  hue: number;
  sat: number;
  light: number;
  /** fraction of colorful pixels whose hue is warm (reds→yellows) */
  warmth: number;
  vibe: VibeLabel;
}

const SAMPLES = 4096;
const LEVELS = 4; // 4 levels/channel → 64 buckets

/** Classify mood from aggregate HSL. Order matters (most specific first). */
export function classifyVibe(sat: number, light: number, warmth: number): VibeLabel {
  if (sat < 0.1) return 'mono'; // essentially greyscale
  if (light < 0.32) return 'moody'; // dark/low-key
  if (sat > 0.45) return 'vibrant'; // punchy color
  if (warmth > 0.55 && light > 0.45) return 'sunwashed'; // warm, bright, gentle
  return 'muted';
}

export function analyzePalette(px: Pixels): PaletteResult {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  // circular mean of hue weighted by saturation, plus mean sat/light
  let sinSum = 0;
  let cosSum = 0;
  let hueWeight = 0;
  let satSum = 0;
  let lightSum = 0;
  let warmCount = 0;
  let colorfulCount = 0;

  const n = samplePixels(px, SAMPLES, (r, g, b) => {
    const key =
      (Math.min(LEVELS - 1, (r * LEVELS) >> 8) << 8) |
      (Math.min(LEVELS - 1, (g * LEVELS) >> 8) << 4) |
      Math.min(LEVELS - 1, (b * LEVELS) >> 8);
    const cur = buckets.get(key);
    if (cur) {
      cur.count++;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }

    const { h, s, l } = rgbToHsl(r, g, b);
    satSum += s;
    lightSum += l;
    if (s > 0.15) {
      const ang = h * Math.PI * 2;
      sinSum += Math.sin(ang) * s;
      cosSum += Math.cos(ang) * s;
      hueWeight += s;
      colorfulCount++;
      // warm = red→yellow (hue < 60° or > 320°)
      if (h < 60 / 360 || h > 320 / 360) warmCount++;
    }
  });

  const top = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((bk) => rgbToHex(bk.r / bk.count, bk.g / bk.count, bk.b / bk.count));

  const hue = hueWeight > 0 ? (Math.atan2(sinSum, cosSum) / (Math.PI * 2) + 1) % 1 : 0;
  const sat = n ? satSum / n : 0;
  const light = n ? lightSum / n : 0;
  const warmth = colorfulCount ? warmCount / colorfulCount : 0;

  return { palette: top, hue, sat, light, warmth, vibe: classifyVibe(sat, light, warmth) };
}
