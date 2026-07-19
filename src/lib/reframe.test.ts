import { describe, it, expect } from 'vitest';
import { reframeTransform, REFRAME_MAX_SCALE } from './reframe';

const base = { scale: 1, offX: 0, offY: 0 };
const still = (d: number) => ({ dist: d, midX: 100, midY: 100 });

describe('reframeTransform (in-cell pinch/pan math)', () => {
  it('pinch-out multiplies the zoom by the distance ratio', () => {
    const r = reframeTransform(base, still(100), still(200), 500, 500, 1);
    expect(r.imgScale).toBe(2); // 1 × (200/100)
    expect(r.imgOffsetX).toBe(0); // no pan
  });

  it('never zooms below 1× or above the cap', () => {
    expect(reframeTransform(base, still(200), still(50), 500, 500, 1).imgScale).toBe(1);
    expect(reframeTransform({ ...base, scale: 3 }, still(100), still(400), 500, 500, 1).imgScale).toBe(
      REFRAME_MAX_SCALE,
    );
  });

  it('dragging the fingers right moves the image right (offset decreases)', () => {
    const r = reframeTransform(
      base,
      { dist: 100, midX: 100, midY: 100 },
      { dist: 100, midX: 200, midY: 100 }, // +100px right
      500,
      500,
      1,
    );
    // Δ = -(2 × 100) / (500 × 1) = -0.4
    expect(r.imgOffsetX).toBeCloseTo(-0.4, 5);
    expect(r.imgOffsetY).toBe(0);
  });

  it('accounts for the stage zoom (absScale) so pan feels 1:1 on screen', () => {
    const r = reframeTransform(
      base,
      { dist: 100, midX: 0, midY: 0 },
      { dist: 100, midX: 100, midY: 0 },
      500,
      500,
      2, // stage zoomed 2× → same screen px is half the offset
    );
    expect(r.imgOffsetX).toBeCloseTo(-0.2, 5);
  });

  it('clamps pan offsets to [-1, 1]', () => {
    const r = reframeTransform(
      base,
      { dist: 100, midX: 0, midY: 0 },
      { dist: 100, midX: 9999, midY: -9999 },
      500,
      500,
      1,
    );
    expect(r.imgOffsetX).toBe(-1);
    expect(r.imgOffsetY).toBe(1);
  });
});
