import { describe, it, expect } from 'vitest';
import {
  adjustPixel,
  applyAdjustments,
  applyPresetToStack,
  copyStackForPaste,
  isNeutral,
  luma,
  neutralStack,
} from './editStack';
import { NEUTRAL_ADJUSTMENTS } from '../types';
import type { Adjustments } from '../types';
import { FILTER_PRESETS } from './presets';

const adj = (partial: Partial<Adjustments>): Adjustments => ({
  ...NEUTRAL_ADJUSTMENTS,
  ...partial,
});

function makeBuffer(pixels: [number, number, number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((p, i) => data.set(p, i * 4));
  return data;
}

describe('adjustPixel', () => {
  it('is identity with neutral adjustments', () => {
    expect(adjustPixel(120, 45, 200, NEUTRAL_ADJUSTMENTS)).toEqual([120, 45, 200]);
  });

  it('exposure +50 is exactly +1 stop (doubles values)', () => {
    const [r, g, b] = adjustPixel(40, 60, 80, adj({ exposure: 50 }));
    expect([r, g, b]).toEqual([80, 120, 160]);
  });

  it('exposure -50 halves values', () => {
    const [r] = adjustPixel(100, 100, 100, adj({ exposure: -50 }));
    expect(r).toBeCloseTo(50);
  });

  it('contrast pivots around mid gray', () => {
    expect(adjustPixel(128, 128, 128, adj({ contrast: 60 }))).toEqual([128, 128, 128]);
    const [dark] = adjustPixel(64, 64, 64, adj({ contrast: 50 }));
    const [bright] = adjustPixel(192, 192, 192, adj({ contrast: 50 }));
    expect(dark).toBeLessThan(64);
    expect(bright).toBeGreaterThan(192);
  });

  it('saturation -100 produces gray at the pixel luma', () => {
    const [r, g, b] = adjustPixel(200, 50, 50, adj({ saturation: -100 }));
    expect(r).toBeCloseTo(g, 0);
    expect(g).toBeCloseTo(b, 0);
    expect(r).toBeCloseTo(luma(200, 50, 50), 0);
  });

  it('positive temperature warms (red up, blue down)', () => {
    const [r, , b] = adjustPixel(100, 100, 100, adj({ temperature: 50 }));
    expect(r).toBeGreaterThan(100);
    expect(b).toBeLessThan(100);
  });

  it('shadows lifts dark pixels but not bright ones', () => {
    const [dark] = adjustPixel(30, 30, 30, adj({ shadows: 60 }));
    const [bright] = adjustPixel(220, 220, 220, adj({ shadows: 60 }));
    expect(dark).toBeGreaterThan(30);
    expect(bright).toBe(220);
  });

  it('highlights compresses bright pixels but not dark ones', () => {
    const [bright] = adjustPixel(230, 230, 230, adj({ highlights: -60 }));
    const [dark] = adjustPixel(40, 40, 40, adj({ highlights: -60 }));
    expect(bright).toBeLessThan(230);
    expect(dark).toBe(40);
  });

  it('vibrance boosts muted colors more than saturated ones', () => {
    const muted = adjustPixel(140, 120, 110, adj({ vibrance: 60 }));
    const vivid = adjustPixel(255, 10, 10, adj({ vibrance: 60 }));
    const mutedGain = Math.max(...muted) - Math.min(...muted) - (140 - 110);
    const vividGain = Math.max(...vivid) - Math.min(...vivid) - (255 - 10);
    expect(mutedGain).toBeGreaterThan(vividGain);
  });

  it('clamps to the displayable range', () => {
    const [r] = adjustPixel(200, 200, 200, adj({ exposure: 100 }));
    expect(r).toBe(255);
    const [r2] = adjustPixel(20, 20, 20, adj({ exposure: -100 }));
    expect(r2).toBeGreaterThanOrEqual(0);
  });
});

describe('applyAdjustments (buffer)', () => {
  it('leaves the buffer untouched when neutral', () => {
    const data = makeBuffer([
      [10, 20, 30, 255],
      [200, 150, 100, 255],
    ]);
    const before = [...data];
    applyAdjustments(data, 2, 1, NEUTRAL_ADJUSTMENTS);
    expect([...data]).toEqual(before);
  });

  it('never touches the alpha channel', () => {
    const data = makeBuffer([
      [10, 20, 30, 200],
      [200, 150, 100, 128],
    ]);
    applyAdjustments(data, 2, 1, adj({ exposure: 40, contrast: 30, vignette: 50 }));
    expect(data[3]).toBe(200);
    expect(data[7]).toBe(128);
  });

  it('vignette darkens corners more than the center', () => {
    const size = 21;
    const data = new Uint8ClampedArray(size * size * 4).fill(200);
    applyAdjustments(data, size, size, adj({ vignette: 100 }));
    const center = ((10 * size + 10) * 4) as number;
    const corner = 0;
    expect(data[center]).toBeGreaterThan(data[corner]);
    expect(data[corner]).toBeLessThan(200);
  });

  it('sharpen increases local contrast at an edge', () => {
    // 5×5: left half dark, right half bright
    const w = 5,
      h = 5;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = x < 2 ? 50 : 200;
        data.set([v, v, v, 255], (y * w + x) * 4);
      }
    applyAdjustments(data, w, h, adj({ sharpness: 100 }));
    // pixel just right of the edge should overshoot brighter than 200
    const i = (2 * w + 2) * 4;
    expect(data[i]).toBeGreaterThan(200);
  });
});

describe('edit stack helpers', () => {
  it('neutralStack is neutral', () => {
    expect(isNeutral(neutralStack().adjustments)).toBe(true);
  });

  it('copyStackForPaste drops the crop but keeps adjustments', () => {
    const stack = {
      adjustments: adj({ exposure: 30 }),
      crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, rotate: 90 as const, flipH: false, flipV: false },
      presetId: 'ember',
    };
    const pasted = copyStackForPaste(stack);
    expect(pasted.crop).toBeUndefined();
    expect(pasted.adjustments.exposure).toBe(30);
    expect(pasted.presetId).toBe('ember');
    // deep copy — mutating the paste must not touch the source
    pasted.adjustments.exposure = 0;
    expect(stack.adjustments.exposure).toBe(30);
  });

  it('applyPresetToStack keeps the crop and swaps adjustments', () => {
    const crop = { x: 0, y: 0, width: 1, height: 0.8, rotate: 0 as const, flipH: true, flipV: false };
    const stack = { adjustments: adj({ exposure: 50 }), crop };
    const next = applyPresetToStack(stack, adj({ contrast: 25 }), 'glacier');
    expect(next.crop).toEqual(crop);
    expect(next.adjustments.exposure).toBe(0);
    expect(next.adjustments.contrast).toBe(25);
    expect(next.presetId).toBe('glacier');
  });
});

describe('filter presets', () => {
  it('ships at least 12 presets plus Original', () => {
    expect(FILTER_PRESETS.length).toBeGreaterThanOrEqual(13);
  });

  it('all presets have unique ids and names', () => {
    expect(new Set(FILTER_PRESETS.map((p) => p.id)).size).toBe(FILTER_PRESETS.length);
    expect(new Set(FILTER_PRESETS.map((p) => p.name)).size).toBe(FILTER_PRESETS.length);
  });

  it('preset adjustments stay within valid ranges', () => {
    for (const p of FILTER_PRESETS) {
      const a = p.adjustments;
      for (const key of Object.keys(NEUTRAL_ADJUSTMENTS) as (keyof Adjustments)[]) {
        expect(Math.abs(a[key])).toBeLessThanOrEqual(100);
      }
      expect(a.sharpness).toBeGreaterThanOrEqual(0);
      expect(a.vignette).toBeGreaterThanOrEqual(0);
    }
  });
});
