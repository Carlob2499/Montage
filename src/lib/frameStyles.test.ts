import { describe, it, expect } from 'vitest';
import { hashSeed, polaroidMetrics, tapeStrips, tornEdgePath } from './frameStyles';

describe('hashSeed', () => {
  it('is deterministic and spreads distinct ids', () => {
    expect(hashSeed('layer-1')).toBe(hashSeed('layer-1'));
    expect(hashSeed('layer-1')).not.toBe(hashSeed('layer-2'));
  });
});

describe('polaroidMetrics', () => {
  it('scales with the smaller dimension and keeps the classic chin', () => {
    const m = polaroidMetrics(400, 300);
    expect(m.border).toBeGreaterThan(0);
    expect(m.chin).toBeGreaterThan(m.border * 2);
    // proportional across sizes
    const big = polaroidMetrics(800, 600);
    expect(big.border).toBeCloseTo(m.border * 2, -1);
  });
});

describe('tornEdgePath', () => {
  it('is deterministic per seed — preview and export must draw the same shape', () => {
    expect(tornEdgePath(400, 300, 'abc')).toEqual(tornEdgePath(400, 300, 'abc'));
    expect(tornEdgePath(400, 300, 'abc')).not.toEqual(tornEdgePath(400, 300, 'xyz'));
  });

  it('stays inside the layer rect (clip never spills)', () => {
    const pts = tornEdgePath(400, 300, 'seed');
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(400);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(300);
    }
  });

  it('covers all four edges', () => {
    const pts = tornEdgePath(400, 300, 'seed');
    expect(pts.some((p) => p.y < 20)).toBe(true); // top
    expect(pts.some((p) => p.y > 280)).toBe(true); // bottom
    expect(pts.some((p) => p.x < 20)).toBe(true); // left
    expect(pts.some((p) => p.x > 380)).toBe(true); // right
    expect(pts.length).toBeGreaterThan(20);
  });
});

describe('tapeStrips', () => {
  it('returns two deterministic corner strips with opposite tilt', () => {
    const strips = tapeStrips(400, 300, 'layer-1');
    expect(strips).toHaveLength(2);
    expect(strips).toEqual(tapeStrips(400, 300, 'layer-1'));
    expect(strips[0].rotation).toBeLessThan(0);
    expect(strips[1].rotation).toBeGreaterThan(0);
    expect(strips[0].cx).toBeLessThan(strips[1].cx);
  });
});
