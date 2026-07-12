// ---------------------------------------------------------------------------
// Slicing math: mapping between the continuous canvas and exported panels.
// Pure functions — unit tested in slicer.test.ts.
//
// Geometry is per-doc (panelWidth/panelHeight), NOT a global constant, so the
// canvas can be any aspect ratio or custom size. Every function that needs
// panel dimensions takes them explicitly and stays pure.
// ---------------------------------------------------------------------------

import { PANEL_WIDTH, PANEL_HEIGHTS } from '../types';
import type { ProjectDoc } from '../types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Geometry {
  panelWidth: number;
  panelHeight: number;
}

/**
 * Resolve per-panel geometry, tolerant of OLD docs saved before panelWidth/
 * panelHeight existed (falls back to the aspect→PANEL_HEIGHTS lookup).
 */
export function geometryOf(
  doc: Pick<ProjectDoc, 'aspect' | 'panelWidth' | 'panelHeight'>,
): Geometry {
  return {
    panelWidth: doc.panelWidth ?? PANEL_WIDTH,
    panelHeight: doc.panelHeight ?? PANEL_HEIGHTS[doc.aspect] ?? 1350,
  };
}

/** Full canvas pixel size for a project. */
export function canvasSize(
  doc: Pick<ProjectDoc, 'mode' | 'aspect' | 'panelWidth' | 'panelHeight' | 'panelCount'>,
): { width: number; height: number } {
  const { panelWidth, panelHeight } = geometryOf(doc);
  if (doc.mode === 'grid') {
    // profile-grid planner: 3 columns × N rows of square tiles
    return { width: panelWidth * 3, height: panelWidth * doc.panelCount };
  }
  return { width: panelWidth * doc.panelCount, height: panelHeight };
}

/** Canvas-space rect of carousel panel `index` (0-based). */
export function panelRect(panelWidth: number, panelHeight: number, index: number): Rect {
  return { x: index * panelWidth, y: 0, width: panelWidth, height: panelHeight };
}

/** X positions of the internal seams (slice lines) between panels. */
export function seamPositions(panelCount: number, panelWidth: number): number[] {
  const seams: number[] = [];
  for (let i = 1; i < panelCount; i++) seams.push(i * panelWidth);
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
  panelWidth: number,
): { panel: number; x: number; y: number } {
  const panel = Math.min(Math.max(Math.floor(x / panelWidth), 0), panelCount - 1);
  return { panel, x: x - panel * panelWidth, y };
}

/** Map panel-local coordinates back to canvas space. */
export function panelPointToCanvas(
  panel: number,
  x: number,
  y: number,
  panelWidth: number,
): { x: number; y: number } {
  return { x: panel * panelWidth + x, y };
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
export function seamsCrossed(
  bbox: Rect,
  panelCount: number,
  panelWidth: number,
  margin = 0,
): number[] {
  const crossed: number[] = [];
  seamPositions(panelCount, panelWidth).forEach((sx, i) => {
    if (bbox.x < sx + margin && bbox.x + bbox.width > sx - margin) crossed.push(i);
  });
  return crossed;
}

/** Panels (0-based) that a bounding box overlaps. */
export function panelsCovered(bbox: Rect, panelCount: number, panelWidth: number): number[] {
  const first = Math.max(0, Math.floor(bbox.x / panelWidth));
  const last = Math.min(panelCount - 1, Math.ceil((bbox.x + bbox.width) / panelWidth) - 1);
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(i);
  return out;
}

// --- Profile-grid planner ---------------------------------------------------

/** Canvas-space rect of the tile at (row, col) in a 3×N grid of `tile`-px squares. */
export function gridTileRect(row: number, col: number, tile: number): Rect {
  return { x: col * tile, y: row * tile, width: tile, height: tile };
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
  panelWidth: number,
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
    const spans = seamsCrossed(layer.bbox, panelCount, panelWidth).length > 0;
    if (spans) continue;
    const panel = Math.min(Math.max(Math.floor(cx / panelWidth), 0), panelCount - 1);
    const target = newIndex.get(panel)!;
    if (target !== panel) offsets.set(layer.id, (target - panel) * panelWidth);
  }

  const newCaptions = order.map((oldPanel) => captions[oldPanel] ?? '');
  return { offsets, captions: newCaptions };
}
