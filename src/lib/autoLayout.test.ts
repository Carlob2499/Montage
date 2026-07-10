import { describe, it, expect } from 'vitest';
import { autoLayout, seededRandom, suggestedPanelCount } from './autoLayout';
import type { PhotoDim } from './autoLayout';
import { seamPositions } from './slicer';

const photo = (id: string, w = 4000, h = 3000, t?: number): PhotoDim => ({
  id,
  width: w,
  height: h,
  dateTaken: t,
});

const OPTS = { seed: 42, margin: 48, gutter: 24 } as const;

describe('seededRandom', () => {
  it('is deterministic and uniform-ish', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    for (const v of seqA) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of seqA) expect(v).toBeLessThan(1);
  });
});

describe('autoLayout dump style', () => {
  const photos = Array.from({ length: 10 }, (_, i) => photo(`p${i}`, 4000, 3000, 100 - i));

  it('places every photo exactly once', () => {
    const placed = autoLayout(photos, 1350, 3, { ...OPTS, style: 'dump' });
    expect(placed).toHaveLength(10);
    expect(new Set(placed.map((p) => p.photoId)).size).toBe(10);
  });

  it('is deterministic per seed and varies across seeds', () => {
    const a = autoLayout(photos, 1350, 3, { ...OPTS, style: 'dump', seed: 1 });
    const b = autoLayout(photos, 1350, 3, { ...OPTS, style: 'dump', seed: 1 });
    const c = autoLayout(photos, 1350, 3, { ...OPTS, style: 'dump', seed: 2 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('orders photos by capture time', () => {
    const placed = autoLayout(photos, 1350, 3, { ...OPTS, style: 'dump' });
    // earliest photo (p9, dateTaken 91) must be placed before latest (p0)
    const idx9 = placed.findIndex((p) => p.photoId === 'p9');
    const idx0 = placed.findIndex((p) => p.photoId === 'p0');
    expect(idx9).toBeLessThan(idx0);
  });

  it('never lets a photo touch a slice line (seam-safe)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const placed = autoLayout(photos, 1350, 5, { ...OPTS, style: 'dump', seed });
      const seams = seamPositions(5);
      for (const p of placed) {
        // small allowance for rotation overhang: jitter rotation ≤4°,
        // bbox growth < 8% of the diagonal — SEAM_SAFE covers it
        for (const s of seams) {
          const crosses = p.x < s && p.x + p.width > s;
          expect(crosses, `photo ${p.photoId} crosses seam ${s} (seed ${seed})`).toBe(false);
        }
      }
    }
  });

  it('keeps photos inside the canvas', () => {
    const placed = autoLayout(photos, 1350, 3, { ...OPTS, style: 'dump' });
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(3 * 1080);
      expect(p.y + p.height).toBeLessThanOrEqual(1350);
    }
  });

  it('applies slight rotation in dump style only', () => {
    const dump = autoLayout(photos, 1350, 3, { ...OPTS, style: 'dump' });
    const clean = autoLayout(photos, 1350, 3, { ...OPTS, style: 'clean' });
    expect(dump.some((p) => p.rotation !== 0)).toBe(true);
    expect(clean.every((p) => p.rotation === 0)).toBe(true);
  });
});

describe('autoLayout panorama style', () => {
  it('spans the full canvas width edge to edge (crossing seams)', () => {
    // odd count so photo edges can't accidentally align with the seams
    const photos = Array.from({ length: 5 }, (_, i) => photo(`p${i}`));
    const placed = autoLayout(photos, 1350, 3, { ...OPTS, style: 'panorama' });
    const first = placed[0];
    const last = placed[placed.length - 1];
    expect(first.x).toBeCloseTo(48, 0);
    expect(last.x + last.width).toBeCloseTo(3 * 1080 - 48, 0);
    // panorama style deliberately flows THROUGH slice lines
    const seams = seamPositions(3);
    const crossing = placed.some((p) => seams.some((s) => p.x < s && p.x + p.width > s));
    expect(crossing).toBe(true);
  });

  it('keeps a common row height', () => {
    const photos = [photo('a', 4000, 3000), photo('b', 3000, 4000), photo('c', 4000, 4000)];
    const placed = autoLayout(photos, 1350, 2, { ...OPTS, style: 'panorama' });
    const heights = new Set(placed.map((p) => Math.round(p.height)));
    expect(heights.size).toBe(1);
  });
});

describe('suggestedPanelCount', () => {
  it('grows panels for big batches but never shrinks', () => {
    expect(suggestedPanelCount(10, 2)).toBe(3);
    expect(suggestedPanelCount(3, 4)).toBe(4);
    expect(suggestedPanelCount(100, 2)).toBe(20);
  });
});

describe('autoLayout edge cases', () => {
  it('handles empty input', () => {
    expect(autoLayout([], 1350, 3, { ...OPTS, style: 'dump' })).toEqual([]);
  });

  it('handles one photo', () => {
    const placed = autoLayout([photo('solo')], 1350, 1, { ...OPTS, style: 'dump' });
    expect(placed).toHaveLength(1);
    expect(placed[0].width).toBeGreaterThan(0);
  });
});
