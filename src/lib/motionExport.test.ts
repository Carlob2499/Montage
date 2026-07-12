import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { panelMotionPlan, MIN_PANEL_SEC, MAX_PANEL_SEC } from './motionExport';
import type { PhotoLayer, ProjectDoc } from '../types';

const photo = (id: string, photoId: string, x: number, over: Partial<PhotoLayer> = {}): PhotoLayer => ({
  id,
  type: 'photo',
  photoId,
  x,
  y: 100,
  width: 800,
  height: 800,
  rotation: 0,
  opacity: 1,
  cornerRadius: 0,
  imgScale: 1,
  imgOffsetX: 0,
  imgOffsetY: 0,
  ...over,
});

const doc = (over: Partial<ProjectDoc> = {}): ProjectDoc => ({
  id: 'd',
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

describe('panelMotionPlan', () => {
  it('marks only panels that contain a video clip', () => {
    // clip in panel 0 (x=100), image (not in durations) in panel 1
    const d = doc({ layers: [photo('a', 'vid1', 100), photo('b', 'img1', 1200)] });
    const durs = new Map([['vid1', 4]]);
    const plan = panelMotionPlan(d, durs);
    expect(plan.map((p) => p.hasVideo)).toEqual([true, false, false]);
    expect(plan[0].durationSec).toBe(4);
    expect(plan[0].videoLayerIds).toEqual(['a']);
    expect(plan[1].durationSec).toBe(0);
  });

  it('caps a long clip and floors a short one', () => {
    const d = doc({ layers: [photo('a', 'long', 100), photo('b', 'short', 1200)] });
    const durs = new Map([
      ['long', 30],
      ['short', 0.4],
    ]);
    const plan = panelMotionPlan(d, durs, MAX_PANEL_SEC);
    expect(plan[0].durationSec).toBe(MAX_PANEL_SEC); // capped
    expect(plan[1].durationSec).toBe(MIN_PANEL_SEC); // floored
  });

  it('attributes a seam-spanning clip to every panel it overlaps', () => {
    // wide clip from x=1000, width 800 → spans the seam at 1080 (panels 0 & 1)
    const d = doc({ layers: [photo('a', 'vid', 1000, { width: 800 })] });
    const durs = new Map([['vid', 5]]);
    const plan = panelMotionPlan(d, durs);
    expect(plan[0].hasVideo).toBe(true);
    expect(plan[1].hasVideo).toBe(true);
    expect(plan[2].hasVideo).toBe(false);
  });

  it('uses the longest clip when a panel holds several', () => {
    const d = doc({ layers: [photo('a', 'v1', 100), photo('b', 'v2', 200)] });
    const durs = new Map([
      ['v1', 3],
      ['v2', 6],
    ]);
    const plan = panelMotionPlan(d, durs);
    expect(plan[0].durationSec).toBe(6);
    expect(plan[0].videoLayerIds.sort()).toEqual(['a', 'b']);
  });

  it('returns no motion panels for an all-image doc', () => {
    const d = doc({ layers: [photo('a', 'img1', 100), photo('b', 'img2', 1200)] });
    const plan = panelMotionPlan(d, new Map());
    expect(plan.every((p) => !p.hasVideo)).toBe(true);
  });

  it('never animates a grid doc', () => {
    const d = doc({ mode: 'grid', panelCount: 2, layers: [photo('a', 'vid', 100)] });
    const plan = panelMotionPlan(d, new Map([['vid', 5]]));
    expect(plan.every((p) => !p.hasVideo)).toBe(true);
  });
});
