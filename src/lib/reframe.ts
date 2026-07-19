// ---------------------------------------------------------------------------
// Pure math for the in-cell reframe gesture (two-finger pinch/pan of a photo
// inside its frame). Kept out of the Konva node so it can be unit-tested: the
// node just feeds it touch geometry and applies the result to imgScale/imgOffset.
// ---------------------------------------------------------------------------

export interface ReframeBase {
  scale: number;
  offX: number;
  offY: number;
}
export interface TouchPose {
  /** distance between the two touch points (px) */
  dist: number;
  /** midpoint of the two touch points (px) */
  midX: number;
  midY: number;
}

const clampUnit = (v: number): number => Math.min(1, Math.max(-1, v));

/** Max in-cell zoom reachable by pinch (a bit beyond the slider's 3× headroom). */
export const REFRAME_MAX_SCALE = 5;

/**
 * New (imgScale, imgOffsetX, imgOffsetY) for a pinch/pan from `start` to `cur`.
 * - zoom = base scale × (curDist / startDist), clamped [1, REFRAME_MAX_SCALE]
 * - pan  = the two-finger drag in screen px converted to offset units (-1..1 of
 *   the cover-crop free travel), divided by the on-screen content size
 *   (contentPx × the stage's absolute scale). Dragging the fingers RIGHT moves
 *   the image right (offset decreases), i.e. you "grab" the photo.
 */
export function reframeTransform(
  base: ReframeBase,
  start: TouchPose,
  cur: TouchPose,
  contentW: number,
  contentH: number,
  absScale: number,
): { imgScale: number; imgOffsetX: number; imgOffsetY: number } {
  const imgScale = Math.min(REFRAME_MAX_SCALE, Math.max(1, base.scale * (cur.dist / (start.dist || 1))));
  const denomW = contentW * absScale || 1;
  const denomH = contentH * absScale || 1;
  return {
    imgScale,
    imgOffsetX: clampUnit(base.offX - (2 * (cur.midX - start.midX)) / denomW),
    imgOffsetY: clampUnit(base.offY - (2 * (cur.midY - start.midY)) / denomH),
  };
}
