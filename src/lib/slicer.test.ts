import { describe, it, expect } from 'vitest';
import {
  canvasSize,
  panelRect,
  seamPositions,
  canvasPointToPanel,
  panelPointToCanvas,
  rotatedBBox,
  seamsCrossed,
  panelsCovered,
  gridTileRect,
  gridUploadOrder,
  reorderPanels,
} from './slicer';

// geometry helpers for the classic presets used across these tests
const G = (
  mode: 'carousel' | 'grid',
  aspect: string,
  panelCount: number,
  panelWidth: number,
  panelHeight: number,
) => ({ mode, aspect, panelCount, panelWidth, panelHeight });

describe('canvasSize', () => {
  it('computes carousel canvas for 4:5 panels', () => {
    expect(canvasSize(G('carousel', '4:5', 5, 1080, 1350))).toEqual({
      width: 5400,
      height: 1350,
    });
  });

  it('computes carousel canvas for 1:1 panels', () => {
    expect(canvasSize(G('carousel', '1:1', 3, 1080, 1080))).toEqual({
      width: 3240,
      height: 1080,
    });
  });

  it('computes a landscape 16:9 canvas', () => {
    expect(canvasSize(G('carousel', '16:9', 3, 1920, 1080))).toEqual({
      width: 5760,
      height: 1080,
    });
  });

  it('supports more than 10 panels', () => {
    expect(canvasSize(G('carousel', '4:5', 14, 1080, 1350)).width).toBe(14 * 1080);
  });

  it('computes grid-planner canvas as 3 columns × N rows of squares', () => {
    expect(canvasSize(G('grid', '1:1', 4, 1080, 1080))).toEqual({
      width: 3240,
      height: 4320,
    });
  });
});

describe('panelRect / seams', () => {
  it('slices exact Instagram-native panel rects', () => {
    expect(panelRect(1080, 1350, 0)).toEqual({ x: 0, y: 0, width: 1080, height: 1350 });
    expect(panelRect(1080, 1350, 3)).toEqual({ x: 3240, y: 0, width: 1080, height: 1350 });
    expect(panelRect(1080, 1080, 2)).toEqual({ x: 2160, y: 0, width: 1080, height: 1080 });
    expect(panelRect(1080, 1920, 0).height).toBe(1920);
    // landscape panels are wider than tall
    expect(panelRect(1920, 1080, 1)).toEqual({ x: 1920, y: 0, width: 1920, height: 1080 });
  });

  it('panels tile the canvas with no gaps or overlaps', () => {
    const n = 7;
    for (let i = 0; i < n - 1; i++) {
      const a = panelRect(1080, 1350, i);
      const b = panelRect(1080, 1350, i + 1);
      expect(a.x + a.width).toBe(b.x);
    }
  });

  it('computes internal seam positions', () => {
    expect(seamPositions(1, 1080)).toEqual([]);
    expect(seamPositions(4, 1080)).toEqual([1080, 2160, 3240]);
    expect(seamPositions(3, 1920)).toEqual([1920, 3840]);
  });
});

describe('canvasPointToPanel', () => {
  it('maps interior points', () => {
    expect(canvasPointToPanel(500, 200, 5, 1080)).toEqual({ panel: 0, x: 500, y: 200 });
    expect(canvasPointToPanel(2500, 10, 5, 1080)).toEqual({ panel: 2, x: 340, y: 10 });
  });

  it('assigns seam points to the right-hand panel', () => {
    expect(canvasPointToPanel(1080, 0, 5, 1080).panel).toBe(1);
    expect(canvasPointToPanel(1080, 0, 5, 1080).x).toBe(0);
  });

  it('clamps the far right edge into the last panel', () => {
    const r = canvasPointToPanel(5 * 1080, 0, 5, 1080);
    expect(r.panel).toBe(4);
    expect(r.x).toBe(1080);
  });

  it('round-trips with panelPointToCanvas', () => {
    for (const x of [0, 1, 1079, 1080, 3333, 5399]) {
      const p = canvasPointToPanel(x, 42, 5, 1080);
      expect(panelPointToCanvas(p.panel, p.x, p.y, 1080)).toEqual({ x, y: 42 });
    }
  });
});

describe('rotatedBBox', () => {
  it('is identity at 0°', () => {
    expect(rotatedBBox({ x: 10, y: 20, width: 100, height: 50 }, 0)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
  });

  it('swaps extents at 90°', () => {
    const b = rotatedBBox({ x: 0, y: 0, width: 100, height: 50 }, 90);
    expect(b.width).toBeCloseTo(50);
    expect(b.height).toBeCloseTo(100);
  });

  it('grows the bbox at 45°', () => {
    const b = rotatedBBox({ x: 0, y: 0, width: 100, height: 100 }, 45);
    expect(b.width).toBeCloseTo(100 * Math.SQRT2);
    expect(b.height).toBeCloseTo(100 * Math.SQRT2);
  });
});

describe('seamsCrossed', () => {
  it('detects a box straddling a seam', () => {
    expect(seamsCrossed({ x: 1000, y: 0, width: 200, height: 100 }, 5, 1080)).toEqual([0]);
  });

  it('ignores boxes fully inside one panel', () => {
    expect(seamsCrossed({ x: 100, y: 0, width: 200, height: 100 }, 5, 1080)).toEqual([]);
  });

  it('detects multiple seams for wide boxes', () => {
    expect(seamsCrossed({ x: 500, y: 0, width: 2200, height: 100 }, 5, 1080)).toEqual([0, 1]);
  });

  it('respects the safety margin', () => {
    // box ends 30px before the seam — unsafe within a 40px margin
    const box = { x: 900, y: 0, width: 150, height: 100 };
    expect(seamsCrossed(box, 5, 1080, 0)).toEqual([]);
    expect(seamsCrossed(box, 5, 1080, 40)).toEqual([0]);
  });
});

describe('panelsCovered', () => {
  it('lists all panels a box overlaps', () => {
    expect(panelsCovered({ x: 500, y: 0, width: 2200, height: 100 }, 5, 1080)).toEqual([0, 1, 2]);
    expect(panelsCovered({ x: 0, y: 0, width: 1080, height: 100 }, 5, 1080)).toEqual([0]);
  });

  it('clamps to valid panel range', () => {
    expect(panelsCovered({ x: -500, y: 0, width: 10000, height: 10 }, 3, 1080)).toEqual([0, 1, 2]);
  });
});

describe('profile-grid planner', () => {
  it('computes tile rects', () => {
    expect(gridTileRect(0, 0, 1080)).toEqual({ x: 0, y: 0, width: 1080, height: 1080 });
    expect(gridTileRect(2, 1, 1080)).toEqual({ x: 1080, y: 2160, width: 1080, height: 1080 });
  });

  it('uploads bottom-right first, top-left last', () => {
    const order = gridUploadOrder(2);
    expect(order[0]).toEqual({ row: 1, col: 2 });
    expect(order[order.length - 1]).toEqual({ row: 0, col: 0 });
    expect(order).toHaveLength(6);
  });

  it('covers every tile exactly once', () => {
    const order = gridUploadOrder(3);
    const keys = new Set(order.map((t) => `${t.row},${t.col}`));
    expect(keys.size).toBe(9);
  });
});

describe('reorderPanels', () => {
  const layerIn = (panel: number, id: string) => ({
    id,
    bbox: { x: panel * 1080 + 100, y: 100, width: 300, height: 300 },
  });

  it('moves layers with their panel', () => {
    const layers = [layerIn(0, 'a'), layerIn(1, 'b'), layerIn(2, 'c')];
    const { offsets, captions } = reorderPanels(layers, ['one', 'two', 'three'], 3, 0, 2, 1080);
    // panel 0 → index 2, panel 1 → 0, panel 2 → 1
    expect(offsets.get('a')).toBe(2 * 1080);
    expect(offsets.get('b')).toBe(-1080);
    expect(offsets.get('c')).toBe(-1080);
    expect(captions).toEqual(['two', 'three', 'one']);
  });

  it('leaves seam-spanning layers alone', () => {
    const spanning = { id: 's', bbox: { x: 900, y: 0, width: 500, height: 100 } };
    const { offsets } = reorderPanels([spanning], ['', ''], 2, 0, 1, 1080);
    expect(offsets.has('s')).toBe(false);
  });

  it('is a no-op when from === to', () => {
    const layers = [layerIn(0, 'a')];
    const { offsets, captions } = reorderPanels(layers, ['x', 'y'], 2, 1, 1, 1080);
    expect(offsets.size).toBe(0);
    expect(captions).toEqual(['x', 'y']);
  });
});
