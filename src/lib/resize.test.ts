import { describe, it, expect } from 'vitest';
import { resizeDoc } from './resize';
import type { CardLayer, PhotoLayer, ProjectDoc, StickerLayer, TextLayer } from '../types';

const photo = (over: Partial<PhotoLayer> = {}): PhotoLayer => ({
  id: 'ph',
  type: 'photo',
  photoId: 'p1',
  x: 100,
  y: 200,
  width: 400,
  height: 300,
  rotation: 0,
  opacity: 1,
  cornerRadius: 24,
  imgScale: 1,
  imgOffsetX: 0,
  imgOffsetY: 0,
  ...over,
});

const text = (over: Partial<TextLayer> = {}): TextLayer => ({
  id: 'tx',
  type: 'text',
  text: 'hello',
  x: 90,
  y: 90,
  rotation: 0,
  opacity: 1,
  fontFamily: 'Inter',
  fontSize: 60,
  fontWeight: 400,
  letterSpacing: 4,
  lineHeight: 1.15,
  fill: '#000',
  align: 'left',
  width: 500,
  ...over,
});

const card = (over: Partial<CardLayer> = {}): CardLayer => ({
  id: 'cd',
  type: 'card',
  x: 50,
  y: 50,
  width: 300,
  height: 200,
  rotation: 0,
  opacity: 1,
  cornerRadius: 32,
  fill: 'rgba(255,255,255,0.5)',
  glass: true,
  ...over,
});

const sticker = (over: Partial<StickerLayer> = {}): StickerLayer => ({
  id: 'st',
  type: 'sticker',
  stickerId: 's1',
  x: 10,
  y: 10,
  width: 120,
  height: 120,
  rotation: 0,
  opacity: 1,
  ...over,
});

const doc = (over: Partial<ProjectDoc> = {}): ProjectDoc => ({
  id: 'd1',
  name: 'test',
  mode: 'carousel',
  aspect: '4:5',
  panelWidth: 1080,
  panelHeight: 1350,
  panelCount: 3,
  background: { kind: 'solid', color: '#fff' },
  layers: [],
  captions: ['', '', ''],
  gutter: 24,
  margin: 48,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('resizeDoc', () => {
  it('is an identity transform when the size is unchanged', () => {
    const d = doc({ layers: [photo(), text(), card(), sticker()] });
    const out = resizeDoc(d, 1080, 1350, '4:5');
    expect(out.panelWidth).toBe(1080);
    expect(out.panelHeight).toBe(1350);
    const outPhoto = out.layers[0] as PhotoLayer;
    expect(outPhoto.x).toBeCloseTo(100);
    expect(outPhoto.width).toBeCloseTo(400);
    expect(outPhoto.height).toBeCloseTo(300);
  });

  it('scales positions and sizes proportionally to a landscape target', () => {
    // 1080×1350 → 1920×1080: sx = 1920/1080, sy = 1080/1350
    const sx = 1920 / 1080;
    const sy = 1080 / 1350;
    const d = doc({ layers: [photo({ isSubject: false })] });
    const out = resizeDoc(d, 1920, 1080, '16:9');
    expect(out.aspect).toBe('16:9');
    expect(out.panelWidth).toBe(1920);
    expect(out.panelHeight).toBe(1080);
    const p = out.layers[0] as PhotoLayer;
    expect(p.x).toBeCloseTo(100 * sx);
    expect(p.y).toBeCloseTo(200 * sy);
    expect(p.width).toBeCloseTo(400 * sx);
    expect(p.height).toBeCloseTo(300 * sy);
    expect(p.cornerRadius).toBeCloseTo(24 * ((sx + sy) / 2));
  });

  it('scales text fontSize by sy and letterSpacing/width by sx', () => {
    const sx = 1920 / 1080;
    const sy = 1080 / 1350;
    const d = doc({ layers: [text()] });
    const out = resizeDoc(d, 1920, 1080, '16:9');
    const t = out.layers[0] as TextLayer;
    expect(t.fontSize).toBeCloseTo(60 * sy);
    expect(t.letterSpacing).toBeCloseTo(4 * sx);
    expect(t.width).toBeCloseTo(500 * sx);
  });

  it('scales margin and gutter', () => {
    const sx = 1920 / 1080;
    const sy = 1080 / 1350;
    const out = resizeDoc(doc(), 1920, 1080, '16:9');
    expect(out.margin).toBeCloseTo(48 * ((sx + sy) / 2));
    expect(out.gutter).toBeCloseTo(24 * sx);
  });

  it('forces square tiles and 1:1 aspect for grid docs', () => {
    const d = doc({ mode: 'grid', aspect: '1:1', panelWidth: 1080, panelHeight: 1080 });
    const out = resizeDoc(d, 1200, 1600, '2:3');
    expect(out.aspect).toBe('1:1');
    expect(out.panelWidth).toBe(1200);
    expect(out.panelHeight).toBe(1200); // targetH = panelWidth for grid
  });

  it('re-nudges a seam-crossing text layer clear of the new seams', () => {
    // text straddling the seam at 1080 in a 3-panel doc; after an identity
    // resize the re-nudge should push it fully off the seam
    const straddling = text({ x: 960, width: 240, fontSize: 40, letterSpacing: 0 });
    const d = doc({ layers: [straddling] });
    const out = resizeDoc(d, 1080, 1350, '4:5');
    const t = out.layers[0] as TextLayer;
    // it moved off x=960 (either left or right of the seam)
    expect(t.x).not.toBe(960);
  });

  it('does not re-nudge non-subject photos', () => {
    const straddling = photo({ x: 960, width: 240, isSubject: false });
    const d = doc({ layers: [straddling] });
    const out = resizeDoc(d, 1080, 1350, '4:5');
    const p = out.layers[0] as PhotoLayer;
    expect(p.x).toBeCloseTo(960);
  });

  it('preserves layer count and ids', () => {
    const d = doc({ layers: [photo(), text(), card(), sticker()] });
    const out = resizeDoc(d, 1920, 1080, '16:9');
    expect(out.layers.map((l) => l.id)).toEqual(['ph', 'tx', 'cd', 'st']);
  });
});
