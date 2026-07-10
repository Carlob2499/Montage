import { describe, it, expect } from 'vitest';
import { buildRecapDoc, computeRecapStats, haversineKm } from './recap';
import type { AlbumRecord, PhotoRecord } from '../types';

let n = 0;
const photo = (partial: Partial<PhotoRecord>): PhotoRecord => ({
  id: `p${++n}`,
  albumId: 'a1',
  fileName: `IMG_${n}.jpg`,
  mimeType: 'image/jpeg',
  byteSize: 1000,
  width: 4000,
  height: 3000,
  dateAdded: n,
  tags: [],
  order: n,
  kind: 'image',
  ...partial,
});

const album: AlbumRecord = { id: 'a1', name: 'Lisbon', createdAt: 0, sortMode: 'dateTaken' };

const DAY = 86_400_000;
const t0 = new Date(2026, 5, 3, 10).getTime(); // Jun 3 2026 local

describe('haversineKm', () => {
  it('computes a known distance (Paris → London ≈ 344 km)', () => {
    const d = haversineKm({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 });
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(360);
  });

  it('is zero for identical points', () => {
    expect(haversineKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBeCloseTo(0);
  });
});

describe('computeRecapStats', () => {
  it('counts photos, distinct days, and formats the range', () => {
    const stats = computeRecapStats([
      photo({ dateTaken: t0 }),
      photo({ dateTaken: t0 + 2 * DAY }),
      photo({ dateTaken: t0 + 2 * DAY + 3600_000 }), // same day as previous
      photo({ dateTaken: t0 + 11 * DAY }),
    ]);
    expect(stats.photoCount).toBe(4);
    expect(stats.days).toBe(3);
    expect(stats.dateRange).toBe("Jun 3 – Jun 14 '26");
    expect(stats.distanceKm).toBeNull();
  });

  it('single-day trips get a single date', () => {
    const stats = computeRecapStats([photo({ dateTaken: t0 }), photo({ dateTaken: t0 + 60_000 })]);
    expect(stats.dateRange).toBe("Jun 3 '26");
  });

  it('sums the GPS trail in time order', () => {
    const stats = computeRecapStats([
      photo({ dateTaken: t0 + DAY, gps: { lat: 48.8566, lng: 2.3522 } }), // Paris (later)
      photo({ dateTaken: t0, gps: { lat: 51.5074, lng: -0.1278 } }), // London (earlier)
      photo({ dateTaken: t0 + 2 * DAY, gps: { lat: 48.8566, lng: 2.3522 } }), // stays
    ]);
    expect(stats.distanceKm).toBeGreaterThan(330);
    expect(stats.distanceKm).toBeLessThan(360);
  });
});

describe('buildRecapDoc', () => {
  let idCounter = 0;
  const makeId = () => `id-${++idCounter}`;

  it('builds cover + photo panels + outro with everything placed', () => {
    const photos = Array.from({ length: 8 }, (_, i) => photo({ dateTaken: t0 + i * DAY }));
    const doc = buildRecapDoc(album, photos, makeId);
    expect(doc.mode).toBe('carousel');
    expect(doc.panelCount).toBe(4); // cover + 2 photo panels + outro
    const photoLayers = doc.layers.filter((l) => l.type === 'photo');
    expect(photoLayers).toHaveLength(8);
    // photos sit past the cover panel and before the outro panel
    for (const l of photoLayers) {
      expect(l.x).toBeGreaterThanOrEqual(1080);
      expect(l.x + (l as { width: number }).width).toBeLessThanOrEqual(3 * 1080);
    }
    // cover title carries the album name
    const texts = doc.layers.filter((l) => l.type === 'text');
    expect(texts.some((t) => (t as { text: string }).text === 'Lisbon')).toBe(true);
    expect(texts.some((t) => (t as { text: string }).text === 'fin.')).toBe(true);
    expect(doc.captions).toHaveLength(doc.panelCount);
    expect(doc.captions[0]).toContain('Lisbon');
  });

  it('caps panel count at 20 for huge albums', () => {
    const photos = Array.from({ length: 120 }, (_, i) => photo({ dateTaken: t0 + i * 3600_000 }));
    const doc = buildRecapDoc(album, photos, makeId);
    expect(doc.panelCount).toBeLessThanOrEqual(20);
    expect(doc.layers.filter((l) => l.type === 'photo')).toHaveLength(120);
  });
});
