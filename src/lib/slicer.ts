// ---------------------------------------------------------------------------
// Slicing math: mapping between the continuous canvas and exported panels.
// Pure functions — unit tested in slicer.test.ts.
// ---------------------------------------------------------------------------

import { PANEL_WIDTH, PANEL_HEIGHTS } from '../types';
import type { PanelAspect, ProjectDoc } from '../types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Full canvas pixel size for a project. */
export function canvasSize(doc: Pick<ProjectDoc, 'mode' | 'aspect' | 'panelCount'>): {
  width: number;
  height: number;
} {
  if (doc.mode === 'grid') {
    // profile-grid planner: 3 columns × N rows of square tiles
    return { width: PANEL_WIDTH * 3, height: PANEL_WIDTH * doc.panelCount };
  }
  return {
    width: PANEL_WIDTH * doc.panelCount,
    height: PANEL_HEIGHTS[doc.aspect],
  };
}

/** Canvas-space rect of carousel panel `index` (0-based). */
export function panelRect(aspect: PanelAspect, index: number): Rect {
  return {
    x: index * PANEL_WIDTH,
    y: 0,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHTS[aspect],
  };
}

/** X positions of the internal seams (slice lines) between panels. */
export function seamPositions(panelCount: number): number[] {
  const seams: number[] = [];
  for (let i = 1; i < panelCount; i++) seams.push(i * PANEL_WIDTH);
  return seams;
}

/**
 * Map a canvas point to its panel and panel-local coordinates.
 * Points on a seam belong to the panel on the right (matching how the
 * crop `x >= panelX && x < panelX + width` behaves), except the far right
 * edge which clamps into the last panel.
 */
export function canvasPointToPanel(
  x: number,
  y: number,
  panelCount: number,
): { panel: number; x: number; y: number } {
  const panel = Math.min(Math.max(Math.floor(x / PANEL_WIDTH), 0), panelCount - 1);
  return { panel, x: x - panel * PANEL_WIDTH, y };
}

/** Map panel-local coordinates back to canvas space. */
export function panelPointToCanvas(
  panel: number,
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: panel * PANEL_WIDTH + x, y };
}

/**
 * Axis-aligned bounding box of a rotated rect (rotation in degrees around
 * the rect's top-left corner, matching Konva's default).
 */
export function rotatedBBox(rect: Rect, rotationDeg: number): Rect {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    { x: 0, y: 0 },
    { x: rect.width, y: 0 },
    { x: 0, y: rect.height },
    { x: rect.width, y: rect.height },
  ].map((p) => ({
    x: rect.x + p.x * cos - p.y * sin,
    y: rect.y + p.x * sin + p.y * cos,
  }));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

/**
 * Which seams a bounding box crosses, with a safety margin on each side of
 * the seam. Returns seam indexes (seam i sits between panel i and i+1).
 */
export function seamsCrossed(bbox: Rect, panelCount: number, margin = 0): number[] {
  const crossed: number[] = [];
  seamPositions(panelCount).forEach((sx, i) => {
    if (bbox.x < sx + margin && bbox.x + bbox.width > sx - margin) crossed.push(i);
  });
  return crossed;
}

/** Panels (0-based) that a bounding box overlaps. */
export function panelsCovered(bbox: Rect, panelCount: number): number[] {
  const first = Math.max(0, Math.floor(bbox.x / PANEL_WIDTH));
  const last = Math.min(
    panelCount - 1,
    Math.ceil((bbox.x + bbox.width) / PANEL_WIDTH) - 1,
  );
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(i);
  return out;
}

// --- Profile-grid planner ---------------------------------------------------

/** Canvas-space rect of the tile at (row, col) in a 3×N grid of squares. */
export function gridTileRect(row: number, col: number): Rect {
  return {
    x: col * PANEL_WIDTH,
    y: row * PANEL_WIDTH,
    width: PANEL_WIDTH,
    height: PANEL_WIDTH,
  };
}

/**
 * Instagram fills the profile grid newest-first: the most recent post is
 * top-left. To reproduce a 3×N composite you upload the bottom-right tile
 * FIRST and the top-left tile LAST. Returns tiles in upload order.
 */
export function gridUploadOrder(rows: number): { row: number; col: number }[] {
  const order: { row: number; col: number }[] = [];
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = 2; col >= 0; col--) {
      order.push({ row, col });
    }
  }
  return order;
}

// --- Panel reordering --------------------------------------------------------

/**
 * Move panel `from` to position `to`, translating layers with it. A layer is
 * carried by the panel that contains its bbox center. Layers spanning seams
 * stay put (they belong to the composition, not a single panel).
 * Returns new layer x-offsets keyed by layer id plus the new caption order.
 */
export function reorderPanels<T extends { id: string; bbox: Rect }>(
  layers: T[],
  captions: string[],
  panelCount: number,
  from: number,
  to: number,
): { offsets: Map<string, number>; captions: string[] } {
  const order: number[] = [];
  for (let i = 0; i < panelCount; i++) order.push(i);
  order.splice(to, 0, ...order.splice(from, 1));

  // newX[oldPanel] = new panel index
  const newIndex = new Map<number, number>();
  order.forEach((oldPanel, idx) => newIndex.set(oldPanel, idx));

  const offsets = new Map<string, number>();
  for (const layer of layers) {
    const cx = layer.bbox.x + layer.bbox.width / 2;
    const spans = seamsCrossed(layer.bbox, panelCount).length > 0;
    if (spans) continue;
    const panel = Math.min(
      Math.max(Math.floor(cx / PANEL_WIDTH), 0),
      panelCount - 1,
    );
    const target = newIndex.get(panel)!;
    if (target !== panel) offsets.set(layer.id, (target - panel) * PANEL_WIDTH);
  }

  const newCaptions = order.map((oldPanel) => captions[oldPanel] ?? '');
  return { offsets, captions: newCaptions };
}
