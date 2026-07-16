import { describe, it, expect } from 'vitest';
import { normalizeProjectDoc } from './projectSchema';
import { formatBytes } from './imageUtils';

describe('normalizeProjectDoc', () => {
  it('rejects non-project input', () => {
    expect(() => normalizeProjectDoc(null)).toThrow(/Not a Montage project/);
    expect(() => normalizeProjectDoc([])).toThrow(/Not a Montage project/);
    expect(() => normalizeProjectDoc({ foo: 1 })).toThrow(/Not a Montage project/);
    expect(() => normalizeProjectDoc({ id: 'x' })).toThrow(/Not a Montage project/);
  });

  it('repairs a minimal doc with all optional fields missing', () => {
    const doc = normalizeProjectDoc({ id: 'x', layers: [], panelCount: 3 });
    expect(doc.mode).toBe('carousel');
    expect(doc.aspect).toBe('4:5');
    expect(doc.background).toEqual({ kind: 'solid', color: '#ffffff' });
    expect(doc.captions).toHaveLength(3);
    expect(doc.name).toBe('Imported project');
    expect(Number.isFinite(doc.gutter)).toBe(true);
  });

  it('drops malformed layers but keeps valid ones', () => {
    const doc = normalizeProjectDoc({
      id: 'x',
      layers: [
        {},
        { type: 'photo' },
        { id: 'p1', type: 'photo', photoId: 'ph', x: 1, y: 2, width: 100, height: 100 },
        { id: 't1', type: 'text', text: 'hi' },
        { id: 's1', type: 'sticker' }, // no stickerId → dropped
        { id: 'wat', type: 'blob' },
      ],
      panelCount: 1,
    });
    expect(doc.layers.map((l) => l.id)).toEqual(['p1', 't1']);
  });

  it('fills defaults and clamps ranges on layers', () => {
    const doc = normalizeProjectDoc({
      id: 'x',
      panelCount: 2,
      layers: [
        {
          id: 'p1',
          type: 'photo',
          photoId: 'ph',
          opacity: 7,
          imgScale: 0.1,
          imgOffsetX: -9,
          width: 'NaN',
        },
      ],
    });
    const p = doc.layers[0] as { opacity: number; imgScale: number; imgOffsetX: number; width: number };
    expect(p.opacity).toBe(1);
    expect(p.imgScale).toBe(1);
    expect(p.imgOffsetX).toBe(-1);
    expect(p.width).toBeGreaterThan(0);
  });

  it('normalizes layer shadow, stroke, and mask shape', () => {
    const doc = normalizeProjectDoc({
      id: 'x',
      panelCount: 1,
      layers: [
        {
          id: 'p1',
          type: 'photo',
          photoId: 'ph',
          width: 100,
          height: 100,
          maskShape: 'heart',
          stroke: { color: '#fff', width: 6 },
          shadow: { color: 'rgba(0,0,0,0.4)', blur: 20, offsetX: 2, offsetY: 8 },
        },
        {
          id: 'p2',
          type: 'photo',
          photoId: 'ph',
          width: 100,
          height: 100,
          maskShape: 'bogus',
          stroke: { color: '#fff', width: 0 }, // zero → dropped
        },
      ],
    });
    const p1 = doc.layers[0] as {
      maskShape?: string;
      stroke?: { width: number };
      shadow?: { blur: number };
    };
    expect(p1.maskShape).toBe('heart');
    expect(p1.stroke?.width).toBe(6);
    expect(p1.shadow?.blur).toBe(20);
    const p2 = doc.layers[1] as { maskShape?: string; stroke?: unknown };
    expect(p2.maskShape).toBeUndefined(); // invalid shape rejected
    expect(p2.stroke).toBeUndefined(); // zero-width stroke rejected
  });

  it('forces 1:1 aspect for grid mode and clamps panel count', () => {
    const doc = normalizeProjectDoc({
      id: 'x',
      layers: [],
      panelCount: 99,
      mode: 'grid',
      aspect: '4:5',
    });
    expect(doc.aspect).toBe('1:1');
    expect(doc.panelCount).toBe(30);
  });

  it('falls back to a solid background when the stored one is malformed', () => {
    const doc = normalizeProjectDoc({
      id: 'x',
      layers: [],
      panelCount: 1,
      background: { kind: 'blurPhoto' }, // missing photoId
    });
    expect(doc.background.kind).toBe('solid');
  });

  it('preserves caption text and pads to panel count', () => {
    const doc = normalizeProjectDoc({
      id: 'x',
      layers: [],
      panelCount: 4,
      captions: ['one', 42, 'three'],
    });
    expect(doc.captions).toEqual(['one', '', 'three', '']);
  });
});

describe('formatBytes', () => {
  it('never shows an impossible 1024.0 of a smaller unit', () => {
    expect(formatBytes(1048575)).toBe('1.0 MB'); // one byte under 1 MiB
    expect(formatBytes(1073741823)).toBe('1.00 GB'); // one byte under 1 GiB
  });

  it('formats plain values', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
