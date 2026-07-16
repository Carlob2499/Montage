import { describe, it, expect } from 'vitest';
import { faceFocal, saliencyFocal, computeFocal } from './focal';
import { coverCrop } from '../imageUtils';
import type { Pixels } from './pixels';

/** solid gray canvas with a bright square block at (bx,by,bw,bh) in px */
function blockImage(w: number, h: number, bx: number, by: number, bw: number, bh: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 30;
    data[i * 4 + 3] = 255;
  }
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 240;
    }
  }
  return { data, width: w, height: h };
}

describe('faceFocal', () => {
  it('returns the center of the largest face', () => {
    const f = faceFocal([
      { x: 0.0, y: 0.0, width: 0.1, height: 0.1 },
      { x: 0.6, y: 0.6, width: 0.3, height: 0.3 }, // largest
    ]);
    expect(f).not.toBeNull();
    expect(f!.x).toBeCloseTo(0.75, 2);
    expect(f!.y).toBeCloseTo(0.75, 2);
  });
  it('returns null with no faces', () => {
    expect(faceFocal([])).toBeNull();
    expect(faceFocal(undefined)).toBeNull();
  });
});

describe('saliencyFocal', () => {
  it('is pulled toward an off-center bright block', () => {
    // bright block in the lower-right quadrant → focal right & low of center
    const img = blockImage(160, 160, 100, 100, 40, 40);
    const f = saliencyFocal(img);
    expect(f.x).toBeGreaterThan(0.5);
    expect(f.y).toBeGreaterThan(0.5);
    // eased + clamped, never at the extreme edge
    expect(f.x).toBeLessThanOrEqual(0.92);
    expect(f.y).toBeLessThanOrEqual(0.92);
  });
  it('is centered for a flat image', () => {
    const flat = blockImage(160, 160, 0, 0, 0, 0);
    const f = saliencyFocal(flat);
    expect(f.x).toBeCloseTo(0.5, 5);
    expect(f.y).toBeCloseTo(0.5, 5);
  });
});

describe('computeFocal prefers faces', () => {
  it('uses the face over saliency when a face exists', () => {
    const img = blockImage(160, 160, 100, 100, 40, 40); // saliency would pull lower-right
    const f = computeFocal(img, [{ x: 0.0, y: 0.0, width: 0.3, height: 0.3 }]);
    expect(f.x).toBeCloseTo(0.15, 2); // face center wins → upper-left
  });
});

describe('coverCrop focal bias', () => {
  it('is byte-identical to center-crop when no focal is given', () => {
    const a = coverCrop(1200, 900, 1080, 1920, 1.2, 0.3, -0.2);
    const b = coverCrop(1200, 900, 1080, 1920, 1.2, 0.3, -0.2, undefined);
    expect(a).toEqual(b);
    // and matches the hand-computed center formula
    const scale = Math.max(1080 / 1200, 1920 / 900) * 1.2;
    const sw = 1080 / scale;
    const freeX = (1200 - sw) / 2;
    expect(a.sx).toBeCloseTo(freeX + 0.3 * freeX, 4);
  });

  it('keeps the focal point inside the crop window across aspects', () => {
    for (const [iw, ih] of [
      [1200, 900],
      [900, 1600],
      [1600, 900],
    ] as const) {
      for (const focal of [
        { x: 0.85, y: 0.2 },
        { x: 0.1, y: 0.9 },
        { x: 0.5, y: 0.5 },
      ]) {
        const { sx, sy, sw, sh } = coverCrop(iw, ih, 1080, 1920, 1.15, 0, 0, focal);
        const fx = focal.x * iw;
        const fy = focal.y * ih;
        expect(fx).toBeGreaterThanOrEqual(sx - 1);
        expect(fx).toBeLessThanOrEqual(sx + sw + 1);
        expect(fy).toBeGreaterThanOrEqual(sy - 1);
        expect(fy).toBeLessThanOrEqual(sy + sh + 1);
      }
    }
  });

  it('never reads outside the source image', () => {
    const { sx, sy, sw, sh } = coverCrop(1200, 900, 1080, 1920, 1.5, 0, 0, { x: 0.99, y: 0.99 });
    expect(sx).toBeGreaterThanOrEqual(0);
    expect(sy).toBeGreaterThanOrEqual(0);
    expect(sx + sw).toBeLessThanOrEqual(1200 + 0.001);
    expect(sy + sh).toBeLessThanOrEqual(900 + 0.001);
  });
});
