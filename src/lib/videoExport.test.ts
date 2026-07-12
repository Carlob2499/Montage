import { describe, it, expect } from 'vitest';
import { kenBurnsWindow } from './videoExport';

describe('kenBurnsWindow', () => {
  const H = 1350;
  const pw = 1080;

  it('is the full panel at progress 0', () => {
    const w = kenBurnsWindow(500, 0, H, pw);
    expect(w).toEqual({ sx: 500, sy: 0, sw: pw, sh: H });
  });

  it('zooms in (window shrinks) as progress increases', () => {
    const a = kenBurnsWindow(500, 0.5, H, pw);
    const b = kenBurnsWindow(500, 1, H, pw);
    expect(a.sw).toBeLessThan(pw);
    expect(b.sw).toBeLessThan(a.sw);
    expect(b.sh).toBeLessThan(a.sh);
  });

  it('keeps the shrinking window centered on the pan position', () => {
    const x = 500;
    const w = kenBurnsWindow(x, 1, H, pw);
    // horizontal + vertical centers are preserved
    expect(w.sx + w.sw / 2).toBeCloseTo(x + pw / 2);
    expect(w.sy + w.sh / 2).toBeCloseTo(H / 2);
  });

  it('stays within the source strip bounds', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = 0; // left edge
      const w = kenBurnsWindow(x, t, H, pw);
      expect(w.sx).toBeGreaterThanOrEqual(0);
      expect(w.sy).toBeGreaterThanOrEqual(0);
      expect(w.sx + w.sw).toBeLessThanOrEqual(x + pw + 1e-6);
      expect(w.sy + w.sh).toBeLessThanOrEqual(H + 1e-6);
    }
  });

  it('clamps progress outside 0..1', () => {
    expect(kenBurnsWindow(0, -1, H, pw).sw).toBe(pw);
    expect(kenBurnsWindow(0, 5, H, pw)).toEqual(kenBurnsWindow(0, 1, H, pw));
  });
});
