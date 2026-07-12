// ---------------------------------------------------------------------------
// Seam-safety assistant: face-aware warnings and one-tap nudge suggestions.
// Pure math here; the FaceDetector integration lives in useFaceScan.
// ---------------------------------------------------------------------------

import type { PhotoLayer } from '../types';
import { seamPositions } from './slicer';
import type { Rect } from './slicer';
import { coverCrop } from './imageUtils';
import { frameContentRect } from './frameStyles';

/** default keep-out distance from a slice line */
export const SEAM_MARGIN = 40;

function isSafe(bbox: Rect, seams: number[], margin: number): boolean {
  return seams.every((s) => bbox.x + bbox.width <= s - margin || bbox.x >= s + margin);
}

/**
 * Minimal horizontal shift that moves `bbox` fully clear of every seam
 * (± margin) while staying inside the canvas. Returns 0 when already safe,
 * null when no such shift exists (box wider than a panel's safe interior).
 */
export function suggestNudge(
  bbox: Rect,
  panelCount: number,
  panelWidth: number,
  margin = SEAM_MARGIN,
): number | null {
  const seams = seamPositions(panelCount, panelWidth);
  if (isSafe(bbox, seams, margin)) return 0;
  if (bbox.width > panelWidth - 2 * margin) return null;

  const canvasW = panelCount * panelWidth;
  const candidates: number[] = [];
  for (const s of seams) {
    candidates.push(s - margin - (bbox.x + bbox.width)); // land left of the seam
    candidates.push(s + margin - bbox.x); // land right of the seam
  }
  let best: number | null = null;
  for (const dx of candidates) {
    const moved = { ...bbox, x: bbox.x + dx };
    if (moved.x < 0 || moved.x + moved.width > canvasW) continue;
    if (!isSafe(moved, seams, margin)) continue;
    if (best === null || Math.abs(dx) < Math.abs(best)) best = dx;
  }
  return best;
}

/**
 * Map a detected face (normalized source-image coords) into canvas space
 * through the layer's cover-fit. Approximate: ignores the edit-stack crop
 * (warnings are advisory). Returns null when the face is panned out of the
 * visible frame.
 */
export function faceCanvasRect(
  face: Rect, // normalized 0..1 in source image
  srcW: number,
  srcH: number,
  layer: PhotoLayer,
): Rect | null {
  const content = frameContentRect(layer.frameStyle, layer.width, layer.height);
  const { sx, sy, sw, sh } = coverCrop(
    srcW,
    srcH,
    content.width,
    content.height,
    layer.imgScale,
    layer.imgOffsetX,
    layer.imgOffsetY,
  );
  const fx = face.x * srcW;
  const fy = face.y * srcH;
  const fw = face.width * srcW;
  const fh = face.height * srcH;
  // visible portion of the face within the source crop window
  const ix = Math.max(fx, sx);
  const iy = Math.max(fy, sy);
  const ix2 = Math.min(fx + fw, sx + sw);
  const iy2 = Math.min(fy + fh, sy + sh);
  if (ix2 <= ix || iy2 <= iy) return null;
  const scaleX = content.width / sw;
  const scaleY = content.height / sh;
  return {
    x: layer.x + content.x + (ix - sx) * scaleX,
    y: layer.y + content.y + (iy - sy) * scaleY,
    width: (ix2 - ix) * scaleX,
    height: (iy2 - iy) * scaleY,
  };
}
