// ---------------------------------------------------------------------------
// Export renderer: draws the project document onto 2D canvases at full
// resolution, panel by panel. Each panel is rendered by translating the
// continuous canvas, so content flows seamlessly across slice boundaries
// by construction. Output canvases are sRGB (browser default).
// ---------------------------------------------------------------------------

import type { Background, CardLayer, Layer, PhotoLayer, ProjectDoc, TextLayer } from '../types';
import { canvasSize, gridTileRect, panelRect, rotatedBBox } from './slicer';
import type { Rect } from './slicer';
import { applyAdjustments, isNeutral } from './editStack';
import { coverCrop } from './imageUtils';
import { frameContentRect, tapeStrips, tornEdgePath, tracePath } from './frameStyles';
import type { EditStack } from '../types';

export interface PhotoResource {
  bitmap: ImageBitmap;
  stack?: EditStack;
}

export interface RenderResources {
  photos: Map<string, PhotoResource>;
  stickers: Map<string, ImageBitmap>;
  /** live video elements for motion export (photoId → element); when a ready
   *  element exists for a photo layer, its CURRENT frame is drawn instead of
   *  the poster bitmap — same cover-fit math, so playback/export stay in sync */
  videos?: Map<string, HTMLVideoElement>;
  /** per-export caches (populated lazily by the renderer) */
  cropCache?: Map<string, OffscreenCanvas>;
  contentCache?: Map<string, OffscreenCanvas>;
  backdropCache?: OffscreenCanvas | null;
}

function videoFrameReady(el: HTMLVideoElement | undefined): el is HTMLVideoElement {
  return !!el && el.readyState >= 2 && el.videoWidth > 0 && el.videoHeight > 0;
}

type Ctx = OffscreenCanvasRenderingContext2D;

function paintBackground(
  ctx: Ctx,
  bg: Background,
  fullW: number,
  fullH: number,
  resources: RenderResources,
): void {
  switch (bg.kind) {
    case 'solid': {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, fullW, fullH);
      break;
    }
    case 'linear': {
      const rad = ((bg.angle - 90) * Math.PI) / 180;
      const cx = fullW / 2;
      const cy = fullH / 2;
      const r = Math.sqrt(fullW * fullW + fullH * fullH) / 2;
      const g = ctx.createLinearGradient(
        cx - Math.cos(rad) * r,
        cy - Math.sin(rad) * r,
        cx + Math.cos(rad) * r,
        cy + Math.sin(rad) * r,
      );
      applyStops(g, bg.stops, bg.from, bg.to);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, fullW, fullH);
      break;
    }
    case 'radial': {
      const g = ctx.createRadialGradient(
        fullW / 2,
        fullH / 2,
        0,
        fullW / 2,
        fullH / 2,
        Math.max(fullW, fullH) / 1.5,
      );
      applyStops(g, bg.stops, bg.from, bg.to);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, fullW, fullH);
      break;
    }
    case 'blurPhoto': {
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, fullW, fullH);
      const backdrop = blurredBackdrop(bg, fullW, fullH, resources);
      if (backdrop) ctx.drawImage(backdrop, 0, 0, fullW, fullH);
      break;
    }
  }
}

/**
 * Pre-render the blurred backdrop ONCE per export (cached in resources) at a
 * reduced resolution, cover-cropped to the exact canvas aspect. The blur
 * primitive is downscale-then-upscale (works on every browser) sharpened up
 * with ctx.filter blur where supported — so Safari < 18 (no OffscreenCanvas
 * ctx.filter) still gets a real blur, and every panel slices the SAME pixels.
 */
function blurredBackdrop(
  bg: Extract<Background, { kind: 'blurPhoto' }>,
  fullW: number,
  fullH: number,
  resources: RenderResources,
): OffscreenCanvas | null {
  if (resources.backdropCache !== undefined) return resources.backdropCache;
  const res = resources.photos.get(bg.photoId);
  if (!res) {
    resources.backdropCache = null;
    return null;
  }
  const scale = Math.min(1, 1600 / fullW, 1600 / fullH);
  const w = Math.max(1, Math.round(fullW * scale));
  const h = Math.max(1, Math.round(fullH * scale));
  const blurPx = bg.blur * scale;

  // stage 1: cover-crop to canvas aspect at 1/k size (k grows with the blur)
  const k = Math.max(1, blurPx / 2);
  const smallW = Math.max(1, Math.round(w / k));
  const smallH = Math.max(1, Math.round(h / k));
  const small = new OffscreenCanvas(smallW, smallH);
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  const { sx, sy, sw, sh } = coverCrop(res.bitmap.width, res.bitmap.height, w, h, 1, 0, 0);
  sctx.drawImage(res.bitmap, sx, sy, sw, sh, 0, 0, smallW, smallH);

  // stage 2: upscale (implicit blur) + ctx.filter where available
  const out = new OffscreenCanvas(w, h);
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  try {
    octx.filter = `blur(${Math.min(blurPx, 60)}px)`;
  } catch {
    /* unsupported — downscale alone approximates the blur */
  }
  octx.drawImage(small, 0, 0, smallW, smallH, 0, 0, w, h);
  try {
    octx.filter = 'none';
  } catch {
    /* ignore */
  }
  if (bg.dim > 0) {
    octx.fillStyle = `rgba(0,0,0,${bg.dim})`;
    octx.fillRect(0, 0, w, h);
  }
  resources.backdropCache = out;
  return out;
}

function applyStops(
  g: CanvasGradient,
  stops: { color: string; at: number }[] | undefined,
  from: string,
  to: string,
): void {
  if (stops && stops.length >= 2) {
    for (const s of stops) g.addColorStop(s.at, s.color);
  } else {
    g.addColorStop(0, from);
    g.addColorStop(1, to);
  }
}

function roundedRectPath(ctx: Ctx, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(rad, 0);
  ctx.arcTo(w, 0, w, h, rad);
  ctx.arcTo(w, h, 0, h, rad);
  ctx.arcTo(0, h, 0, 0, rad);
  ctx.arcTo(0, 0, w, 0, rad);
  ctx.closePath();
}

/**
 * Apply the stack crop (crop rect + rotate/flip) once per photo, cached for
 * the whole export. Returns the effective source image and its dimensions.
 */
function croppedSource(
  photoId: string,
  res: PhotoResource,
  resources: RenderResources,
): { source: CanvasImageSource; iw: number; ih: number } {
  const crop = res.stack?.crop;
  if (!crop) return { source: res.bitmap, iw: res.bitmap.width, ih: res.bitmap.height };
  resources.cropCache ??= new Map();
  let mid = resources.cropCache.get(photoId);
  if (!mid) {
    const iw = res.bitmap.width;
    const ih = res.bitmap.height;
    const cw = Math.max(1, Math.round(crop.width * iw));
    const ch = Math.max(1, Math.round(crop.height * ih));
    const rotated = crop.rotate === 90 || crop.rotate === 270;
    mid = new OffscreenCanvas(rotated ? ch : cw, rotated ? cw : ch);
    const mctx = mid.getContext('2d')!;
    mctx.imageSmoothingQuality = 'high';
    mctx.save();
    mctx.translate(mid.width / 2, mid.height / 2);
    mctx.rotate((crop.rotate * Math.PI) / 180);
    mctx.scale(crop.flipH ? -1 : 1, crop.flipV ? -1 : 1);
    mctx.drawImage(res.bitmap, crop.x * iw, crop.y * ih, cw, ch, -cw / 2, -ch / 2, cw, ch);
    mctx.restore();
    resources.cropCache.set(photoId, mid);
  }
  return { source: mid, iw: mid.width, ih: mid.height };
}

/**
 * Render one sub-rect of a photo layer's content (layer coords) with the edit
 * stack applied. The caller passes a rect padded beyond the visible area by
 * at least the sharpen kernel radius, so convolution output inside the
 * visible area is IDENTICAL to a full-frame render — adjacent panel slices
 * stay pixel-continuous across seams. Vignette is frame-aware for the same
 * reason.
 */
function renderPhotoContentRegion(
  layer: PhotoLayer,
  res: PhotoResource,
  resources: RenderResources,
  rect: { x: number; y: number; width: number; height: number },
  contentW: number,
  contentH: number,
): OffscreenCanvas {
  const w = Math.max(1, Math.round(contentW));
  const h = Math.max(1, Math.round(contentH));
  const { source, iw, ih } = croppedSource(layer.photoId, res, resources);
  const { sx, sy, sw, sh } = coverCrop(
    iw,
    ih,
    w,
    h,
    layer.imgScale,
    layer.imgOffsetX,
    layer.imgOffsetY,
  );
  // source pixels per output pixel along each axis
  const rx = sw / w;
  const ry = sh / h;
  const out = new OffscreenCanvas(Math.max(1, rect.width), Math.max(1, rect.height));
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    source,
    sx + rect.x * rx,
    sy + rect.y * ry,
    rect.width * rx,
    rect.height * ry,
    0,
    0,
    rect.width,
    rect.height,
  );
  const adj = res.stack?.adjustments;
  if (adj && !isNeutral(adj)) {
    const imageData = ctx.getImageData(0, 0, out.width, out.height);
    applyAdjustments(imageData.data, out.width, out.height, adj, {
      offsetX: rect.x,
      offsetY: rect.y,
      frameWidth: w,
      frameHeight: h,
    });
    ctx.putImageData(imageData, 0, 0);
  }
  return out;
}

/** padding beyond the visible rect so sharpen convolution stays seam-exact */
const CONTENT_PAD = 8;

function paintPhotoLayer(
  ctx: Ctx,
  layer: PhotoLayer,
  resources: RenderResources,
  region: Rect,
): void {
  const res = resources.photos.get(layer.photoId);
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.globalAlpha = layer.opacity;

  const content = frameContentRect(layer.frameStyle, layer.width, layer.height);

  // frame backing (drawn before the photo)
  if (layer.frameStyle === 'polaroid') {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#fdfdf8';
    ctx.fillRect(0, 0, layer.width, layer.height);
    ctx.restore();
  }
  if (layer.frameStyle === 'torn') {
    const pts = tornEdgePath(layer.width, layer.height, layer.id);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    tracePath(ctx, pts);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    tracePath(ctx, pts);
    ctx.clip();
  } else if (layer.cornerRadius > 0 && !layer.frameStyle) {
    roundedRectPath(ctx, layer.width, layer.height, layer.cornerRadius);
    ctx.clip();
  }

  const videoEl = resources.videos?.get(layer.photoId);
  const liveVideo = videoFrameReady(videoEl);

  if (!res && !liveVideo) {
    // unfilled placeholder — export as subtle neutral block
    ctx.fillStyle = 'rgba(127,127,127,0.15)';
    ctx.fillRect(content.x, content.y, content.width, content.height);
    ctx.restore();
    return;
  }

  if (liveVideo) {
    // Draw the clip's CURRENT frame with the same cover-fit as the poster/
    // editor (coverCrop). Per-frame color adjustments/crop are intentionally
    // skipped for motion — the poster still carries them.
    const cover = coverCrop(
      videoEl.videoWidth,
      videoEl.videoHeight,
      content.width,
      content.height,
      layer.imgScale,
      layer.imgOffsetX,
      layer.imgOffsetY,
    );
    ctx.drawImage(
      videoEl,
      cover.sx,
      cover.sy,
      cover.sw,
      cover.sh,
      content.x,
      content.y,
      content.width,
      content.height,
    );
  } else if (res && layer.rotation === 0) {
    // Axis-aligned: render ONLY the region-intersecting slice (plus pad).
    // Bounds memory for panorama-wide layers (a 20-panel photo never
    // allocates a 29-megapixel canvas) and skips per-panel recompute.
    const originX = layer.x + content.x;
    const originY = layer.y + content.y;
    const visX = Math.max(0, Math.floor(region.x - originX));
    const visY = Math.max(0, Math.floor(region.y - originY));
    const visX2 = Math.min(content.width, Math.ceil(region.x + region.width - originX));
    const visY2 = Math.min(content.height, Math.ceil(region.y + region.height - originY));
    if (visX2 > visX && visY2 > visY) {
      const padX = Math.max(0, visX - CONTENT_PAD);
      const padY = Math.max(0, visY - CONTENT_PAD);
      const padX2 = Math.min(content.width, visX2 + CONTENT_PAD);
      const padY2 = Math.min(content.height, visY2 + CONTENT_PAD);
      const slice = renderPhotoContentRegion(
        layer,
        res,
        resources,
        {
          x: padX,
          y: padY,
          width: Math.round(padX2 - padX),
          height: Math.round(padY2 - padY),
        },
        content.width,
        content.height,
      );
      ctx.drawImage(
        slice,
        visX - padX,
        visY - padY,
        visX2 - visX,
        visY2 - visY,
        content.x + visX,
        content.y + visY,
        visX2 - visX,
        visY2 - visY,
      );
    }
  } else if (res) {
    // Rotated: render the full content once and cache it across panels.
    resources.contentCache ??= new Map();
    let cached = resources.contentCache.get(layer.id);
    if (!cached) {
      cached = renderPhotoContentRegion(
        layer,
        res,
        resources,
        {
          x: 0,
          y: 0,
          width: Math.max(1, Math.round(content.width)),
          height: Math.max(1, Math.round(content.height)),
        },
        content.width,
        content.height,
      );
      resources.contentCache.set(layer.id, cached);
    }
    ctx.drawImage(cached, content.x, content.y);
  }

  // washi tape strips over the photo
  if (layer.frameStyle === 'tape') {
    for (const strip of tapeStrips(layer.width, layer.height, layer.id)) {
      ctx.save();
      ctx.translate(strip.cx, strip.cy);
      ctx.rotate((strip.rotation * Math.PI) / 180);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(-strip.width / 2, -strip.height / 2, strip.width, strip.height);
      ctx.restore();
    }
  }
  ctx.restore();
}

function paintCardLayer(ctx: Ctx, layer: CardLayer): void {
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.globalAlpha = layer.opacity;
  roundedRectPath(ctx, layer.width, layer.height, layer.cornerRadius);
  ctx.fillStyle = layer.fill;
  ctx.fill();
  if (layer.glass) {
    // top sheen + hairline border — the glassmorphism read
    ctx.save();
    roundedRectPath(ctx, layer.width, layer.height, layer.cornerRadius);
    ctx.clip();
    const sheen = ctx.createLinearGradient(0, 0, 0, layer.height);
    sheen.addColorStop(0, 'rgba(255,255,255,0.32)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.04)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, layer.width, layer.height);
    ctx.restore();
    roundedRectPath(ctx, layer.width, layer.height, layer.cornerRadius);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

// shared measuring context (lazy — renderer is also imported in node tests)
let measureCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
function getMeasureCtx() {
  if (!measureCtx) {
    if (typeof OffscreenCanvas !== 'undefined') {
      measureCtx = new OffscreenCanvas(1, 1).getContext('2d');
    } else if (typeof document !== 'undefined') {
      measureCtx = document.createElement('canvas').getContext('2d');
    }
  }
  return measureCtx;
}

function textFont(layer: TextLayer): string {
  return `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
}

/** Width of one line including letter spacing (Konva adds spacing per glyph). */
function measureLine(
  ctx: { measureText(t: string): TextMetrics },
  line: string,
  letterSpacing: number,
): number {
  const base = ctx.measureText(line).width;
  return base + Math.max(0, line.length - 1) * letterSpacing;
}

/**
 * Measured size of a text layer using real glyph metrics — MUST match what
 * paintTextLayer draws and approximate Konva's Text node, since this feeds
 * panel culling, seam warnings, snapping, and panel reordering. Falls back to
 * an estimate when no canvas is available (node tests).
 */
export function measureTextLayer(layer: TextLayer): { width: number; height: number } {
  const lines = layer.text.split('\n');
  const height = layer.fontSize * layer.lineHeight * lines.length;
  if (layer.width) return { width: layer.width, height };
  const ctx = getMeasureCtx();
  if (!ctx) {
    const longest = Math.max(...lines.map((l) => l.length), 1);
    return { width: layer.fontSize * longest * 0.6, height };
  }
  ctx.font = textFont(layer);
  const width = Math.max(...lines.map((l) => measureLine(ctx, l, layer.letterSpacing)), 1);
  return { width, height };
}

function paintTextLayer(ctx: Ctx, layer: TextLayer): void {
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.globalAlpha = layer.opacity;
  ctx.fillStyle = layer.fill;
  ctx.font = textFont(layer);
  ctx.textBaseline = 'top';
  const lines = layer.text.split('\n');
  const lineH = layer.fontSize * layer.lineHeight;
  // Konva auto-sizes width-less text to its widest line and still aligns
  // shorter lines inside that box — mirror it so export matches the editor.
  const boxW =
    layer.width ?? Math.max(...lines.map((l) => measureLine(ctx, l, layer.letterSpacing)), 1);
  lines.forEach((line, i) => {
    const w = measureLine(ctx, line, layer.letterSpacing);
    let x = 0;
    if (layer.align === 'center') x = (boxW - w) / 2;
    else if (layer.align === 'right') x = boxW - w;
    const y = i * lineH;
    if (layer.letterSpacing !== 0) {
      // per-glyph drawing: matches Konva and works on browsers without
      // ctx.letterSpacing (Safari < 17.4)
      let cx = x;
      for (const ch of line) {
        ctx.fillText(ch, cx, y);
        cx += ctx.measureText(ch).width + layer.letterSpacing;
      }
    } else {
      ctx.fillText(line, x, y);
    }
  });
  ctx.restore();
}

function paintStickerLayer(
  ctx: Ctx,
  layer: Layer & { type: 'sticker' },
  resources: RenderResources,
): void {
  const bmp = resources.stickers.get(layer.stickerId);
  if (!bmp) return;
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.globalAlpha = layer.opacity;
  ctx.drawImage(bmp, 0, 0, layer.width, layer.height);
  ctx.restore();
}

export function layerBBox(layer: Layer): Rect {
  const size =
    layer.type === 'text'
      ? measureTextLayer(layer)
      : { width: layer.width, height: layer.height };
  return rotatedBBox({ x: layer.x, y: layer.y, ...size }, layer.rotation);
}

/**
 * Render one region of the continuous canvas into a fresh canvas.
 * `outputScale` < 1 renders a downscaled output (used to keep the panorama
 * export inside mobile canvas-size limits).
 */
export function renderRegion(
  doc: ProjectDoc,
  region: Rect,
  resources: RenderResources,
  outputScale = 1,
): OffscreenCanvas {
  const { width: fullW, height: fullH } = canvasSize(doc);
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(region.width * outputScale)),
    Math.max(1, Math.round(region.height * outputScale)),
  );
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(outputScale, outputScale);
  ctx.translate(-region.x, -region.y);

  paintBackground(ctx, doc.background, fullW, fullH, resources);

  for (const layer of doc.layers) {
    // skip layers that can't intersect this region — with a safety pad so
    // small metric drift (fonts, shadows) never culls a visibly-overlapping layer
    const PAD = 16;
    const bbox = layerBBox(layer);
    if (
      bbox.x > region.x + region.width + PAD ||
      bbox.x + bbox.width < region.x - PAD ||
      bbox.y > region.y + region.height + PAD ||
      bbox.y + bbox.height < region.y - PAD
    ) {
      continue;
    }
    if (layer.type === 'photo') paintPhotoLayer(ctx, layer, resources, region);
    else if (layer.type === 'text') paintTextLayer(ctx, layer);
    else if (layer.type === 'card') paintCardLayer(ctx, layer);
    else paintStickerLayer(ctx, layer, resources);
  }
  return canvas;
}

/** Render carousel panel `index` at exact Instagram-native resolution. */
export function renderPanel(
  doc: ProjectDoc,
  index: number,
  resources: RenderResources,
): OffscreenCanvas {
  return renderRegion(doc, panelRect(doc.panelWidth, doc.panelHeight, index), resources);
}

/** Render profile-grid tile (row, col) at 1080×1080. */
export function renderGridTile(
  doc: ProjectDoc,
  row: number,
  col: number,
  resources: RenderResources,
): OffscreenCanvas {
  return renderRegion(doc, gridTileRect(row, col, doc.panelWidth), resources);
}
