import { describe, it, expect } from 'vitest';
import { importResizeWidth } from './imageUtils';

describe('importResizeWidth (bounded-memory decode target)', () => {
  it('returns null when dimensions are unknown (caller full-decodes)', () => {
    expect(importResizeWidth(undefined, undefined, 1600)).toBeNull();
    expect(importResizeWidth(0, 0, 1600)).toBeNull();
    expect(importResizeWidth(4000, undefined, 1600)).toBeNull();
  });

  it('returns null when the source already fits (never upscales)', () => {
    expect(importResizeWidth(1200, 900, 1600)).toBeNull();
    expect(importResizeWidth(1600, 1200, 1600)).toBeNull();
  });

  it('caps a 48MP landscape photo to the proxy long edge', () => {
    // 8000×6000 → long edge 8000, scale 1600/8000=0.2 → width 1600
    expect(importResizeWidth(8000, 6000, 1600)).toBe(1600);
  });

  it('caps a portrait photo by its long (height) edge', () => {
    // 6000×8000 → long edge 8000 → width 6000*0.2 = 1200
    expect(importResizeWidth(6000, 8000, 1600)).toBe(1200);
  });

  it('shrinks by ~24x in pixel count for a huge source (the OOM fix)', () => {
    const w = importResizeWidth(8000, 6000, 1600)!;
    const h = Math.round((w / 8000) * 6000);
    const before = 8000 * 6000;
    const after = w * h;
    expect(before / after).toBeGreaterThan(20);
  });

  it('uses the output-width (post-rotation) for EXIF orientation 5-8 (90°/270°)', () => {
    // iPhone portrait: stored 4032×3024, orientation=6 → display is 3024×4032
    // long=4032, displayW=rawH=3024 → resizeW=3024*(1600/4032)=1200
    expect(importResizeWidth(4032, 3024, 1600, 6)).toBe(1200);
    expect(importResizeWidth(4032, 3024, 1600, 5)).toBe(1200);
    expect(importResizeWidth(4032, 3024, 1600, 7)).toBe(1200);
    expect(importResizeWidth(4032, 3024, 1600, 8)).toBe(1200);
    // no rotation: landscape photo is unchanged
    expect(importResizeWidth(8000, 6000, 1600, 1)).toBe(1600);
    expect(importResizeWidth(8000, 6000, 1600, 4)).toBe(1600);
  });
});
