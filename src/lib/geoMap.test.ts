import { describe, it, expect } from 'vitest';
import { projectPoints, clusterPoints } from './geoMap';

const W = 360;
const H = 440;
const PAD = 30;

describe('projectPoints', () => {
  it('returns nothing for an empty set', () => {
    expect(projectPoints([], W, H)).toEqual([]);
  });

  it('centers a single point', () => {
    const [p] = projectPoints([{ lat: 40, lng: -74 }], W, H, PAD);
    expect(p.x).toBeCloseTo(W / 2, 3);
    expect(p.y).toBeCloseTo(H / 2, 3);
  });

  it('keeps all points inside the padded box', () => {
    const pts = projectPoints(
      [
        { lat: 40.7, lng: -74 },
        { lat: 48.85, lng: 2.35 },
        { lat: 35.68, lng: 139.7 },
      ],
      W,
      H,
      PAD,
    );
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(PAD - 1e-6);
      expect(p.x).toBeLessThanOrEqual(W - PAD + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(PAD - 1e-6);
      expect(p.y).toBeLessThanOrEqual(H - PAD + 1e-6);
    }
  });

  it('puts a more-northern point higher on screen (smaller y)', () => {
    const [south, north] = projectPoints(
      [
        { lat: 10, lng: 0 },
        { lat: 50, lng: 0 },
      ],
      W,
      H,
      PAD,
    );
    expect(north.y).toBeLessThan(south.y);
  });

  it('puts a more-eastern point further right (larger x)', () => {
    const [west, east] = projectPoints(
      [
        { lat: 0, lng: 10 },
        { lat: 0, lng: 50 },
      ],
      W,
      H,
      PAD,
    );
    expect(east.x).toBeGreaterThan(west.x);
  });

  it('preserves geographic aspect (uniform scale)', () => {
    // a 1°×1° square near the equator projects to a near-square on screen
    const pts = projectPoints(
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
        { lat: 1, lng: 0 },
      ],
      500,
      500,
      0,
    );
    const dx = Math.abs(pts[1].x - pts[0].x);
    const dy = Math.abs(pts[2].y - pts[0].y);
    expect(dx).toBeCloseTo(dy, 0);
  });
});

describe('clusterPoints', () => {
  it('merges points within the radius', () => {
    const c = clusterPoints(
      [
        { x: 100, y: 100 },
        { x: 105, y: 103 },
        { x: 110, y: 98 },
      ],
      20,
    );
    expect(c).toHaveLength(1);
    expect(c[0].indices).toEqual([0, 1, 2]);
  });

  it('splits points beyond the radius', () => {
    const c = clusterPoints(
      [
        { x: 10, y: 10 },
        { x: 300, y: 300 },
      ],
      20,
    );
    expect(c).toHaveLength(2);
  });

  it('centroid stays within the cluster spread', () => {
    const c = clusterPoints(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      20,
    );
    expect(c[0].x).toBeCloseTo(5, 5);
    expect(c[0].y).toBeCloseTo(0, 5);
  });
});
