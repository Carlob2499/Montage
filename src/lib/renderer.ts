// ---------------------------------------------------------------------------
// Export renderer: draws the project document onto 2D canvases at full
// resolution, panel by panel. Each panel is rendered by translating the
// continuous canvas, so content flows seamlessly across slice boundaries
// by construction. Output canvases are sRGB (browser default).
// ---------------------------------------------------------------------------

import type { Background, Layer, PhotoLayer, ProjectDoc, TextLayer } from '../types';
import { canvasSize, gridTileRect, panelRect, rotatedBBox } from './slicer';
import type { Rect } from './slicer';
import { applyAdjustments, isNeutral } from './editStack';
import { coverCrop } from './imageUtils';
import type { EditStack } from '../types';

export interface PhotoResource {
  bitmap: ImageBitmap;
  stack?: EditStack;
}

export interface RenderResources {
  photos: Map<string, PhotoResource>;
  stickers: Map<string, ImageBitmap>;
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
      g.addColorStop(0, bg.from);
      g.addColorStop(1, bg.to);
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
      g.addColorStop(0, bg.from);
      g.addColorStop(1, bg.to);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, fullW, fullH);
      break;
    }
    case 'blurPhoto': {
      const res = resources.photos.get(bg.photoId);
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, fullW, fullH);
      if (res) {
        const { sx, sy, sw, sh } = coverCrop(
          res.bitmap.width,
          res.bitmap.height,
          fullW,
          fullH,
          1,
          0,
          0,
        );
        ctx.save();
        ctx.filter = `blur(${bg.blur}px)`;
        ctx.drawImage(res.bitmap, sx, sy, sw, sh, -bg.blur * 2, -bg.blur * 2, fullW + bg.blur * 4, fullH + bg.blur * 4);
        ctx.restore();
        if (bg.dim > 0) {
          ctx.fillStyle = `rgba(0,0,0,${bg.dim})`;
          ctx.fillRect(0, 0, fullW, fullH);
        }
      }
      break;
    }
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
 * Render a photo with its edit stack applied into an offscreen canvas
 * matching the frame size. Adjustments run on the exact pixels drawn, so
 * export quality is independent of the on-screen proxy.
 */
function renderPhotoContent(layer: PhotoLayer, res: PhotoResource): OffscreenCanvas {
  const w = Math.max(1, Math.round(layer.width));
  const h = Math.max(1, Math.round(layer.height));
  const out = new OffscreenCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';

  let source: CanvasImageSource = res.bitmap;
  let iw = res.bitmap.width;
  let ih = res.bitmap.height;

  const crop = res.stack?.crop;
  if (crop) {
    // apply crop + rotate/flip to an intermediate canvas
    const cw = Math.max(1, Math.round(crop.width * iw));
    const ch = Math.max(1, Math.round(crop.height * ih));
    const rotated = crop.rotate === 90 || crop.rotate === 270;
    const mid = new OffscreenCanvas(rotated ? ch : cw, rotated ? cw : ch);
    const mctx = mid.getContext('2d')!;
    mctx.imageSmoothingQuality = 'high';
    mctx.save();
    mctx.translate(mid.width / 2, mid.height / 2);
    mctx.rotate((crop.rotate * Math.PI) / 180);
    mctx.scale(crop.flipH ? -1 : 1, crop.flipV ? -1 : 1);
    mctx.drawImage(
      res.bitmap,
      crop.x * iw,
      crop.y * ih,
      cw,
      ch,
      -cw / 2,
      -ch / 2,
      cw,
      ch,
    );
    mctx.restore();
    source = mid;
    iw = mid.width;
    ih = mid.height;
  }

  const { sx, sy, sw, sh } = coverCrop(
    iw,
    ih,
    w,
    h,
    layer.imgScale,
    layer.imgOffsetX,
    layer.imgOffsetY,
  );
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);

  const adj = res.stack?.adjustments;
  if (adj && !isNeutral(adj)) {
    const imageData = ctx.getImageData(0, 0, w, h);
    applyAdjustments(imageData.data, w, h, adj);
    ctx.putImageData(imageData, 0, 0);
  }
  return out;
}

function paintPhotoLayer(ctx: Ctx, layer: PhotoLayer, resources: RenderResources): void {
  const res = resources.photos.get(layer.photoId);
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.globalAlpha = layer.opacity;
  if (layer.cornerRadius > 0) {
    roundedRectPath(ctx, layer.width, layer.height, layer.cornerRadius);
    ctx.clip();
  }
  if (!res) {
    // unfilled placeholder — export as subtle neutral block
    ctx.fillStyle = 'rgba(127,127,127,0.15)';
    ctx.fillRect(0, 0, layer.width, layer.height);
  } else {
    const content = renderPhotoContent(layer, res);
    ctx.drawImage(content, 0, 0);
  }
  ctx.restore();
}

function paintTextLayer(ctx: Ctx, layer: TextLayer): void {
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.globalAlpha = layer.opacity;
  ctx.fillStyle = layer.fill;
  ctx.font = `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
  ctx.textBaseline = 'top';
  if ('letterSpacing' in ctx) {
    (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${layer.letterSpacing}px`;
  }
  const lines = layer.text.split('\n');
  const lineH = layer.fontSize * layer.lineHeight;
  const boxW = layer.width ?? 0;
  lines.forEach((line, i) => {
    let x = 0;
    if (layer.align !== 'left' && boxW > 0) {
      const w = ctx.measureText(line).width;
      x = layer.align === 'center' ? (boxW - w) / 2 : boxW - w;
    }
    ctx.fillText(line, x, i * lineH);
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
      ? {
          width: layer.width ?? layer.fontSize * layer.text.length * 0.6,
          height:
            layer.fontSize * layer.lineHeight * layer.text.split('\n').length,
        }
      : { width: layer.width, height: layer.height };
  return rotatedBBox({ x: layer.x, y: layer.y, ...size }, layer.rotation);
}

/** Render one region of the continuous canvas into a fresh canvas. */
export function renderRegion(
  doc: ProjectDoc,
  region: Rect,
  resources: RenderResources,
): OffscreenCanvas {
  const { width: fullW, height: fullH } = canvasSize(doc);
  const canvas = new OffscreenCanvas(Math.round(region.width), Math.round(region.height));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(-region.x, -region.y);

  paintBackground(ctx, doc.background, fullW, fullH, resources);

  for (const layer of doc.layers) {
    // skip layers that can't intersect this region
    const bbox = layerBBox(layer);
    if (
      bbox.x > region.x + region.width ||
      bbox.x + bbox.width < region.x ||
      bbox.y > region.y + region.height ||
      bbox.y + bbox.height < region.y
    ) {
      continue;
    }
    if (layer.type === 'photo') paintPhotoLayer(ctx, layer, resources);
    else if (layer.type === 'text') paintTextLayer(ctx, layer);
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
  return renderRegion(doc, panelRect(doc.aspect, index), resources);
}

/** Render profile-grid tile (row, col) at 1080×1080. */
export function renderGridTile(
  doc: ProjectDoc,
  row: number,
  col: number,
  resources: RenderResources,
): OffscreenCanvas {
  return renderRegion(doc, gridTileRect(row, col), resources);
}
