// ---------------------------------------------------------------------------
// Photo mask shapes (circle / arch / heart / blob). Pure path tracers shared by
// the Konva editor (clipFunc) and the export renderer, so a masked photo looks
// identical in both. Each traces a closed path for a w×h box onto a canvas-2D-
// like context (Konva.Context proxies the same methods).
// ---------------------------------------------------------------------------

import type { MaskShape } from '../types';

interface PathCtx {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  ellipse?(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    a0: number,
    a1: number,
    ccw?: boolean,
  ): void;
  closePath(): void;
}

/**
 * Trace a photo's outline — its mask shape if set, otherwise its rounded rect —
 * into a w×h box. Used for the clip path, the drop-shadow silhouette, and the
 * border stroke, in BOTH render paths so they always agree.
 */
export function tracePhotoOutline(
  ctx: PathCtx,
  opts: { maskShape?: MaskShape; cornerRadius: number; width: number; height: number },
): void {
  if (opts.maskShape) {
    traceMask(ctx, opts.maskShape, opts.width, opts.height);
    return;
  }
  const w = opts.width;
  const h = opts.height;
  const r = Math.min(opts.cornerRadius, w / 2, h / 2);
  ctx.beginPath();
  if (r > 0) {
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
  } else {
    ctx.rect(0, 0, w, h);
  }
  ctx.closePath();
}

// unit-box (0..1, y down) control points, scaled to w×h at trace time
const HEART: number[][] = [
  [0.5, 0.28],
  [0.42, 0.08, 0.08, 0.1, 0.06, 0.36],
  [0.04, 0.58, 0.3, 0.72, 0.5, 0.92],
  [0.7, 0.72, 0.96, 0.58, 0.94, 0.36],
  [0.92, 0.1, 0.58, 0.08, 0.5, 0.28],
];

const BLOB: number[][] = [
  [0.5, 0.03],
  [0.78, 0.0, 1.0, 0.22, 0.97, 0.5],
  [0.94, 0.78, 0.78, 1.0, 0.5, 0.97],
  [0.22, 1.0, 0.02, 0.8, 0.05, 0.5],
  [0.08, 0.2, 0.22, 0.06, 0.5, 0.03],
];

function traceUnit(ctx: PathCtx, pts: number[][], w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
  for (let i = 1; i < pts.length; i++) {
    const c = pts[i];
    ctx.bezierCurveTo(c[0] * w, c[1] * h, c[2] * w, c[3] * h, c[4] * w, c[5] * h);
  }
  ctx.closePath();
}

/** Trace the mask path for `shape` into a w×h box (leaves the path current). */
export function traceMask(ctx: PathCtx, shape: MaskShape, w: number, h: number): void {
  switch (shape) {
    case 'circle': {
      const rx = w / 2;
      const ry = h / 2;
      ctx.beginPath();
      if (ctx.ellipse) {
        ctx.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
      } else {
        // bezier-circle fallback (kappa) scaled to an ellipse
        const kx = rx * 0.5522847498;
        const ky = ry * 0.5522847498;
        ctx.moveTo(0, ry);
        ctx.bezierCurveTo(0, ry - ky, rx - kx, 0, rx, 0);
        ctx.bezierCurveTo(rx + kx, 0, w, ry - ky, w, ry);
        ctx.bezierCurveTo(w, ry + ky, rx + kx, h, rx, h);
        ctx.bezierCurveTo(rx - kx, h, 0, ry + ky, 0, ry);
      }
      ctx.closePath();
      break;
    }
    case 'arch': {
      // straight sides, semicircular top; radius clamped so it never overflows
      const r = Math.min(w / 2, h);
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, r);
      ctx.arc(w / 2, r, w / 2, Math.PI, 0, false);
      ctx.lineTo(w, h);
      ctx.closePath();
      break;
    }
    case 'heart':
      traceUnit(ctx, HEART, w, h);
      break;
    case 'blob':
      traceUnit(ctx, BLOB, w, h);
      break;
  }
}
