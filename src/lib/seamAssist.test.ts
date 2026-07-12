import { describe, it, expect } from 'vitest';
import { faceCanvasRect, suggestNudge } from './seamAssist';
import type { PhotoLayer } from '../types';

describe('suggestNudge', () => {
  it('returns 0 when already safe', () => {
    expect(suggestNudge({ x: 100, y: 0, width: 300, height: 300 }, 3, 1080)).toBe(0);
  });

  it('nudges the minimal distance off a seam', () => {
    // box 900..1150 straddles the seam at 1080; margin 40
    const dx = suggestNudge({ x: 900, y: 0, width: 250, height: 100 }, 3, 1080, 40);
    expect(dx).not.toBeNull();
    // left landing: 1040 - 1150 = -110; right landing: 1120 - 900 = 220 → left wins
    expect(dx).toBe(-110);
    // after the nudge it is safe
    expect(suggestNudge({ x: 900 + dx!, y: 0, width: 250, height: 100 }, 3, 1080, 40)).toBe(0);
  });

  it('prefers the right side when closer', () => {
    const dx = suggestNudge({ x: 1060, y: 0, width: 200, height: 100 }, 3, 1080, 40);
    expect(dx).toBe(60); // right landing 1120-1060=60 vs left 1040-1260=-220
  });

  it('respects canvas bounds', () => {
    // near the left canvas edge, only a right nudge is possible
    const dx = suggestNudge({ x: 1000, y: 0, width: 1050, height: 100 }, 2, 1080, 40);
    expect(dx).toBeNull(); // wider than a panel's safe interior
  });

  it('returns null when the box cannot fit between seams', () => {
    expect(suggestNudge({ x: 500, y: 0, width: 1080, height: 100 }, 3, 1080)).toBeNull();
  });

  it('clears MULTIPLE seams for boxes near two slice lines', () => {
    const dx = suggestNudge({ x: 1050, y: 0, width: 500, height: 100 }, 3, 1080, 40);
    expect(dx).not.toBeNull();
    const moved = { x: 1050 + dx!, y: 0, width: 500, height: 100 };
    expect(suggestNudge(moved, 3, 1080, 40)).toBe(0);
  });
});

describe('faceCanvasRect', () => {
  const layer = (over: Partial<PhotoLayer> = {}): PhotoLayer => ({
    id: 'l1',
    type: 'photo',
    photoId: 'p1',
    x: 1000,
    y: 100,
    width: 400,
    height: 400,
    rotation: 0,
    opacity: 1,
    cornerRadius: 0,
    imgScale: 1,
    imgOffsetX: 0,
    imgOffsetY: 0,
    ...over,
  });

  it('maps a centered face through a square cover-fit 1:1', () => {
    // square image in square frame: cover crop is identity
    const rect = faceCanvasRect(
      { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      800,
      800,
      layer(),
    );
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeCloseTo(1000 + 100);
    expect(rect!.y).toBeCloseTo(100 + 100);
    expect(rect!.width).toBeCloseTo(200);
    expect(rect!.height).toBeCloseTo(200);
  });

  it('accounts for cover cropping of a wide image', () => {
    // 1600×800 image in 400×400 frame: cover shows the middle 800px square
    const rect = faceCanvasRect(
      { x: 0.05, y: 0.1, width: 0.1, height: 0.4 }, // face at far left — cropped away
      1600,
      800,
      layer(),
    );
    expect(rect).toBeNull();
    const center = faceCanvasRect(
      { x: 0.45, y: 0.3, width: 0.1, height: 0.3 },
      1600,
      800,
      layer(),
    );
    expect(center).not.toBeNull();
    expect(center!.width).toBeCloseTo((0.1 * 1600 * 400) / 800);
  });
});
