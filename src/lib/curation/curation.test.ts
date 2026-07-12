import { describe, it, expect } from 'vitest';
import type { Pixels } from './pixels';
import { rgbToHsl } from './pixels';
import { sharpness, colorfulness, exposure, qualityScore } from './quality';
import { pHash, hammingDistance } from './phash';
import { analyzePalette, classifyVibe } from './palette';
import { curateAlbum } from './select';
import type { PhotoRecord, PhotoScores } from '../../types';

/** build a Pixels bag from a per-pixel color function */
function makePixels(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

const gray = (v: number) => makePixels(64, 64, () => [v, v, v]);
const checkerboard = makePixels(64, 64, (x, y) => {
  const v = (x + y) % 2 === 0 ? 240 : 15;
  return [v, v, v];
});

describe('rgbToHsl', () => {
  it('maps primaries correctly', () => {
    expect(rgbToHsl(255, 0, 0).h).toBeCloseTo(0, 2);
    expect(rgbToHsl(0, 255, 0).h).toBeCloseTo(1 / 3, 2);
    expect(rgbToHsl(128, 128, 128).s).toBe(0);
  });
});

describe('sharpness', () => {
  it('scores a high-frequency image far above a flat one', () => {
    expect(sharpness(checkerboard)).toBeGreaterThan(sharpness(gray(128)));
  });
  it('a flat image is near zero', () => {
    expect(sharpness(gray(128))).toBeLessThan(0.05);
  });
});

describe('colorfulness', () => {
  it('a saturated image beats a grey one', () => {
    const red = makePixels(64, 64, () => [220, 20, 20]);
    expect(colorfulness(red)).toBeGreaterThan(colorfulness(gray(128)));
    expect(colorfulness(gray(128))).toBeLessThan(0.05);
  });
});

describe('exposure', () => {
  it('penalizes an all-black (crushed) frame vs a mid-key one', () => {
    const midKey = makePixels(64, 64, (x) => {
      const v = 40 + ((x * 3) % 200);
      return [v, v, v];
    });
    expect(exposure(midKey)).toBeGreaterThan(exposure(gray(2)));
  });
});

describe('qualityScore', () => {
  it('a sharp colorful frame outscores a flat grey one', () => {
    const good = makePixels(64, 64, (x, y) => {
      const on = (x + y) % 2 === 0;
      return on ? [230, 60, 40] : [20, 40, 120];
    });
    expect(qualityScore(good).quality).toBeGreaterThan(qualityScore(gray(128)).quality);
  });
  it('faces add a small bonus', () => {
    const px = gray(128);
    expect(qualityScore(px, 2).quality).toBeGreaterThan(qualityScore(px, 0).quality);
  });
});

describe('pHash / hammingDistance', () => {
  it('identical images have distance 0', () => {
    const a = pHash(checkerboard);
    const b = pHash(makePixels(64, 64, (x, y) => (((x + y) % 2 === 0 ? [240, 240, 240] : [15, 15, 15]))));
    expect(hammingDistance(a, b)).toBe(0);
  });
  it('a brightness shift stays a near-duplicate (small distance)', () => {
    const base = makePixels(64, 64, (x) => { const v = (x * 4) % 256; return [v, v, v]; });
    const brighter = makePixels(64, 64, (x) => { const v = Math.min(255, ((x * 4) % 256) + 20); return [v, v, v]; });
    expect(hammingDistance(pHash(base), pHash(brighter))).toBeLessThanOrEqual(8);
  });
  it('a very different image has a large distance', () => {
    const gradient = makePixels(64, 64, (x) => { const v = (x * 4) % 256; return [v, v, v]; });
    expect(hammingDistance(pHash(gradient), pHash(checkerboard))).toBeGreaterThan(12);
  });
  it('hamming of mismatched lengths is max', () => {
    expect(hammingDistance('abc', 'abcd')).toBe(64);
  });
});

describe('palette / vibe', () => {
  it('a grey image reads as mono', () => {
    expect(analyzePalette(gray(128)).vibe).toBe('mono');
  });
  it('a saturated image reads as vibrant', () => {
    const red = makePixels(64, 64, () => [230, 25, 25]);
    expect(analyzePalette(red).vibe).toBe('vibrant');
  });
  it('classifyVibe buckets by sat/light/warmth', () => {
    expect(classifyVibe(0.05, 0.5, 0.5)).toBe('mono');
    expect(classifyVibe(0.5, 0.2, 0.5)).toBe('moody');
    expect(classifyVibe(0.6, 0.6, 0.3)).toBe('vibrant');
    expect(classifyVibe(0.3, 0.6, 0.8)).toBe('sunwashed');
    expect(classifyVibe(0.2, 0.6, 0.2)).toBe('muted');
  });
  it('extracts dominant swatches', () => {
    const red = makePixels(64, 64, () => [230, 25, 25]);
    expect(analyzePalette(red).palette[0]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// --- curateAlbum ------------------------------------------------------------

let counter = 0;
// well-separated 64-bit hashes so distinct test photos aren't seen as dupes
const spread = (n: number) => ((n * 2654435761) >>> 0).toString(16).padStart(8, '0');
const scores = (over: Partial<PhotoScores> = {}): PhotoScores => ({
  quality: 0.8,
  sharpness: 0.8,
  exposure: 0.8,
  colorfulness: 0.5,
  phash: spread(++counter) + spread(counter * 40503 + 7),
  palette: ['#aabbcc'],
  vibe: 'vibrant',
  hue: 0.1,
  sat: 0.5,
  light: 0.5,
  ...over,
});

const photo = (id: string, over: Partial<PhotoRecord> = {}, sc?: Partial<PhotoScores>): PhotoRecord => ({
  id,
  albumId: 'a',
  fileName: `${id}.jpg`,
  mimeType: 'image/jpeg',
  byteSize: 1000,
  width: 1000,
  height: 1000,
  dateAdded: 1000,
  tags: [],
  order: 0,
  kind: 'image',
  scores: scores(sc),
  ...over,
});

describe('curateAlbum', () => {
  it('keeps the higher-quality shot of a near-duplicate pair', () => {
    const h = '00ff00ff00ff00ff';
    const worse = photo('worse', { dateTaken: 1 }, { phash: h, quality: 0.4 });
    const better = photo('better', { dateTaken: 2 }, { phash: h, quality: 0.9 });
    const res = curateAlbum([worse, better], { targetCount: 5, dedupThreshold: 8 });
    expect(res.picks.map((p) => p.id)).toContain('better');
    expect(res.picks.map((p) => p.id)).not.toContain('worse');
    expect(res.rejected.find((r) => r.id === 'worse')?.reason).toBe('duplicate');
  });

  it('respects the target count', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      photo(`p${i}`, { dateTaken: i * 86_400_000 }),
    );
    const res = curateAlbum(many, { targetCount: 6 });
    expect(res.picks).toHaveLength(6);
  });

  it('detects the dominant vibe', () => {
    const set = [
      photo('a', { dateTaken: 1 }, { vibe: 'moody' }),
      photo('b', { dateTaken: 2 }, { vibe: 'moody' }),
      photo('c', { dateTaken: 3 }, { vibe: 'vibrant' }),
    ];
    expect(curateAlbum(set, { targetCount: 3 }).vibe).toBe('moody');
  });

  it('prefers temporally spread photos (diversity)', () => {
    // 3 clustered same-second shots + 2 far-apart ones; picking 3 should not
    // take all three from the cluster
    const cluster = [0, 1, 2].map((i) =>
      photo(`c${i}`, { dateTaken: 1000 + i }, { phash: (i * 3).toString(16).padStart(16, '0') }),
    );
    const spread = [
      photo('far1', { dateTaken: 5 * 86_400_000 }),
      photo('far2', { dateTaken: 10 * 86_400_000 }),
    ];
    const res = curateAlbum([...cluster, ...spread], { targetCount: 3, dedupThreshold: 2 });
    const ids = res.picks.map((p) => p.id);
    expect(ids).toContain('far1');
    expect(ids).toContain('far2');
  });

  it('returns picks in chronological order', () => {
    const set = [
      photo('late', { dateTaken: 3000 }),
      photo('early', { dateTaken: 1000 }),
      photo('mid', { dateTaken: 2000 }),
    ];
    const res = curateAlbum(set, { targetCount: 3 });
    expect(res.picks.map((p) => p.id)).toEqual(['early', 'mid', 'late']);
  });

  it('handles unscored photos without throwing', () => {
    const bare = photo('bare', { scores: undefined });
    const res = curateAlbum([bare], { targetCount: 3 });
    expect(res.picks).toHaveLength(1);
  });
});
