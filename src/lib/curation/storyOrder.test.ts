import { describe, it, expect } from 'vitest';
import { storyOrder, warmth } from './storyOrder';
import type { PhotoRecord, PhotoScores } from '../../types';

let n = 0;
const scores = (over: Partial<PhotoScores> = {}): PhotoScores => ({
  quality: 0.6,
  sharpness: 0.6,
  exposure: 0.6,
  colorfulness: 0.4,
  phash: '',
  palette: [],
  vibe: 'muted',
  hue: 0.5,
  sat: 0.5,
  light: 0.5,
  ...over,
});

const photo = (over: Partial<PhotoRecord> = {}): PhotoRecord => ({
  id: `p${n++}`,
  albumId: 'a',
  fileName: 'x.jpg',
  mimeType: 'image/jpeg',
  byteSize: 1,
  width: 1200,
  height: 900,
  dateTaken: n * 1000,
  dateAdded: n,
  tags: [],
  order: n,
  kind: 'image',
  scores: scores(),
  ...over,
});

describe('warmth', () => {
  it('is high for orange hue, low for blue', () => {
    const warm = photo({ scores: scores({ hue: 0.08, sat: 0.9 }) });
    const cool = photo({ scores: scores({ hue: 0.6, sat: 0.9 }) });
    expect(warmth(warm)).toBeGreaterThan(warmth(cool));
  });
});

describe('storyOrder', () => {
  it('returns short sets unchanged', () => {
    const p = [photo(), photo()];
    expect(storyOrder(p)).toEqual(p);
  });

  it('is a permutation — no pick added or lost', () => {
    const picks = Array.from({ length: 9 }, () => photo());
    const out = storyOrder(picks);
    expect(out.length).toBe(picks.length);
    expect(new Set(out.map((p) => p.id))).toEqual(new Set(picks.map((p) => p.id)));
  });

  it('opens on an establishing (fewest-faces) shot', () => {
    const picks = [
      photo({ faces: [{ x: 0, y: 0, width: 0.2, height: 0.2 }] }),
      photo({ faces: [] }), // the open one
      photo({ faces: [{ x: 0, y: 0, width: 0.2, height: 0.2 }, { x: 0.5, y: 0.5, width: 0.1, height: 0.1 }] }),
      photo({ faces: [{ x: 0, y: 0, width: 0.2, height: 0.2 }] }),
    ];
    const out = storyOrder(picks);
    expect(out[0].faces?.length ?? 0).toBe(0);
  });

  it('closes on the warmest strong shot', () => {
    const warmId = 'sunset';
    const picks = [
      photo(),
      photo(),
      photo(),
      photo({ id: warmId, scores: scores({ hue: 0.07, sat: 0.95, quality: 0.9 }) }),
    ];
    const out = storyOrder(picks);
    expect(out[out.length - 1].id).toBe(warmId);
  });

  it('is deterministic', () => {
    const picks = Array.from({ length: 8 }, () => photo());
    expect(storyOrder(picks).map((p) => p.id)).toEqual(storyOrder(picks).map((p) => p.id));
  });
});
