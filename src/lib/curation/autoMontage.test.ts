import { describe, it, expect } from 'vitest';
import { buildAutoMontageDoc, VIBE_THEMES } from './autoMontage';
import { normalizeProjectDoc } from '../projectSchema';
import type { AlbumRecord, PhotoRecord, VibeLabel } from '../../types';

const album: AlbumRecord = { id: 'alb1', name: 'Lisbon', createdAt: 1, sortMode: 'dateTaken' };

let n = 0;
const photo = (over: Partial<PhotoRecord> = {}): PhotoRecord => ({
  id: `p${n++}`,
  albumId: 'alb1',
  fileName: 'x.jpg',
  mimeType: 'image/jpeg',
  byteSize: 1000,
  width: 1200,
  height: 900,
  dateTaken: n * 1000,
  dateAdded: n,
  tags: [],
  order: n,
  kind: 'image',
  ...over,
});

let idc = 0;
const makeId = () => `id${idc++}`;

describe('buildAutoMontageDoc', () => {
  const picks = Array.from({ length: 6 }, () => photo());

  it('produces a valid carousel doc that survives normalization', () => {
    const doc = buildAutoMontageDoc(album, picks, 'vibrant', makeId);
    expect(doc.mode).toBe('carousel');
    expect(doc.panelCount).toBeGreaterThanOrEqual(3);
    expect(doc.layers.some((l) => l.type === 'photo')).toBe(true);
    // must not white-screen the editor: normalizes cleanly
    const norm = normalizeProjectDoc(JSON.parse(JSON.stringify(doc)));
    expect(norm.layers.length).toBe(doc.layers.length);
    expect(norm.panelCount).toBe(doc.panelCount);
  });

  it('themes the background + frame style per vibe', () => {
    for (const vibe of ['sunwashed', 'moody', 'vibrant', 'muted', 'mono'] as VibeLabel[]) {
      const doc = buildAutoMontageDoc(album, picks, vibe, makeId);
      expect(doc.background).toEqual(VIBE_THEMES[vibe].background);
      const photoLayer = doc.layers.find((l) => l.type === 'photo');
      expect(photoLayer && 'frameStyle' in photoLayer && photoLayer.frameStyle).toBe(
        VIBE_THEMES[vibe].frameStyle,
      );
      expect(doc.templateId).toBe(`vibe:${vibe}`);
    }
  });

  it('an explicit seed varies the arrangement (Shuffle)', () => {
    let a = 0;
    let b = 0;
    const base = buildAutoMontageDoc(album, picks, 'vibrant', () => `a${a++}`);
    const shuffled = buildAutoMontageDoc(album, picks, 'vibrant', () => `b${b++}`, { seed: 999 });
    const geomBase = base.layers.filter((l) => l.type === 'photo').map((l) => [l.x, l.y]);
    const geomShuf = shuffled.layers.filter((l) => l.type === 'photo').map((l) => [l.x, l.y]);
    // same picks, different layout seed → at least one photo moved
    expect(geomShuf).not.toEqual(geomBase);
  });

  it('is deterministic for the same album + picks', () => {
    let a = 0;
    let b = 100;
    const docA = buildAutoMontageDoc(album, picks, 'moody', () => `a${a++}`);
    const docB = buildAutoMontageDoc(album, picks, 'moody', () => `b${b++}`);
    // layout geometry (seeded by album id) matches regardless of id factory
    const geomA = docA.layers.filter((l) => l.type === 'photo').map((l) => [l.x, l.y]);
    const geomB = docB.layers.filter((l) => l.type === 'photo').map((l) => [l.x, l.y]);
    expect(geomA).toEqual(geomB);
  });
});
