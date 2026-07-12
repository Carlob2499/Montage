// ---------------------------------------------------------------------------
// Snapping and alignment guides for the freeform canvas.
// ---------------------------------------------------------------------------

import type { Rect } from './slicer';
import { seamPositions } from './slicer';

export interface SnapResult {
  x: number;
  y: number;
  guides: { vertical: number[]; horizontal: number[] };
}

export interface SnapTargets {
  vertical: number[];
  horizontal: number[];
}

/**
 * Collect snap targets: seam lines, panel centers, canvas edges/center,
 * margins, and the edges/centers of other layers.
 */
export function collectSnapTargets(
  panelWidth: number,
  panelHeight: number,
  panelCount: number,
  margin: number,
  otherBoxes: Rect[],
  gridMode = false,
  canvasW = 0,
  canvasH = 0,
): SnapTargets {
  const width = gridMode ? canvasW : panelCount * panelWidth;
  const height = gridMode ? canvasH : panelHeight;
  const vertical: number[] = [0, width, width / 2];
  const horizontal: number[] = [0, height, height / 2];

  if (!gridMode) {
    for (const seam of seamPositions(panelCount, panelWidth)) vertical.push(seam);
    for (let i = 0; i < panelCount; i++) vertical.push(i * panelWidth + panelWidth / 2);
  } else {
    for (let x = panelWidth; x < width; x += panelWidth) vertical.push(x);
    for (let y = panelWidth; y < height; y += panelWidth) horizontal.push(y);
  }

  if (margin > 0) {
    vertical.push(margin, width - margin);
    horizontal.push(margin, height - margin);
  }

  for (const box of otherBoxes) {
    vertical.push(box.x, box.x + box.width, box.x + box.width / 2);
    horizontal.push(box.y, box.y + box.height, box.y + box.height / 2);
  }

  return { vertical, horizontal };
}

/**
 * Snap a moving box to the nearest targets within `threshold` px.
 * Checks the box's left/center/right and top/center/bottom edges.
 */
export function snapBox(box: Rect, targets: SnapTargets, threshold: number): SnapResult {
  let bestDx: number | null = null;
  let bestDy: number | null = null;
  const vGuides: number[] = [];
  const hGuides: number[] = [];

  const xEdges = [box.x, box.x + box.width / 2, box.x + box.width];
  const yEdges = [box.y, box.y + box.height / 2, box.y + box.height];

  for (const t of targets.vertical) {
    for (const e of xEdges) {
      const d = t - e;
      if (Math.abs(d) <= threshold && (bestDx === null || Math.abs(d) < Math.abs(bestDx))) {
        bestDx = d;
      }
    }
  }
  for (const t of targets.horizontal) {
    for (const e of yEdges) {
      const d = t - e;
      if (Math.abs(d) <= threshold && (bestDy === null || Math.abs(d) < Math.abs(bestDy))) {
        bestDy = d;
      }
    }
  }

  const x = box.x + (bestDx ?? 0);
  const y = box.y + (bestDy ?? 0);

  // report which guide lines are active after snapping
  if (bestDx !== null) {
    const edges = [x, x + box.width / 2, x + box.width];
    for (const t of targets.vertical) {
      if (edges.some((e) => Math.abs(e - t) < 0.5)) vGuides.push(t);
    }
  }
  if (bestDy !== null) {
    const edges = [y, y + box.height / 2, y + box.height];
    for (const t of targets.horizontal) {
      if (edges.some((e) => Math.abs(e - t) < 0.5)) hGuides.push(t);
    }
  }

  return { x, y, guides: { vertical: [...new Set(vGuides)], horizontal: [...new Set(hGuides)] } };
}
