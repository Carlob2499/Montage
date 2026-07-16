// ---------------------------------------------------------------------------
// Reel frame renderer: draw ONE frame of a ReelDoc at absolute time t onto a
// 2D context. This is the single code path the in-app player (rAF loop) and the
// exporter (captureStream) both call, so preview and export agree by
// construction — invariant #2 (preview/export parity) applied over time.
//
// A slide is one full-bleed photo, cover-fit with a Ken Burns window. Cover and
// outro are painted from the vibe theme (gradient + title/outro text with an
// entrance animation). Transitions blend the incoming segment over the frozen
// last frame of the previous one.
// ---------------------------------------------------------------------------

import type { Background } from '../../types';
import { coverCrop } from '../imageUtils';
import {
  buildTimeline,
  clamp,
  easeInOut,
  segmentAt,
  slideMotionAt,
} from './reelDoc';
import type { ReelDoc, ReelSegment } from './reelDoc';

export interface ReelResources {
  /** photoId → decoded bitmap (poster/proxy for preview, original for export) */
  images: Map<string, ImageBitmap>;
}

type Ctx2D = CanvasRenderingContext2D;

/** dominant color of a background, for the dip-to-color transition + letterbox */
export function backgroundColor(bg: Background): string {
  switch (bg.kind) {
    case 'solid':
      return bg.color;
    case 'linear':
    case 'radial':
      return bg.stops && bg.stops.length ? bg.stops[0].color : bg.from;
    case 'blurPhoto':
      return '#111114';
  }
}

function paintBackground(ctx: Ctx2D, bg: Background, w: number, h: number): void {
  switch (bg.kind) {
    case 'solid': {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'linear': {
      const rad = ((bg.angle - 90) * Math.PI) / 180;
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.sqrt(w * w + h * h) / 2;
      const g = ctx.createLinearGradient(
        cx - Math.cos(rad) * r,
        cy - Math.sin(rad) * r,
        cx + Math.cos(rad) * r,
        cy + Math.sin(rad) * r,
      );
      if (bg.stops && bg.stops.length >= 2) for (const s of bg.stops) g.addColorStop(s.at, s.color);
      else {
        g.addColorStop(0, bg.from);
        g.addColorStop(1, bg.to);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'radial': {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 1.4);
      if (bg.stops && bg.stops.length >= 2) for (const s of bg.stops) g.addColorStop(s.at, s.color);
      else {
        g.addColorStop(0, bg.from);
        g.addColorStop(1, bg.to);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'blurPhoto': {
      ctx.fillStyle = '#111114';
      ctx.fillRect(0, 0, w, h);
      break;
    }
  }
}

/** cover-fit a bitmap into (w,h) with a Ken Burns zoom/pan, full-bleed. When a
 *  focal point is given the crop anchors on the subject (R3). */
function drawPhotoCover(
  ctx: Ctx2D,
  img: ImageBitmap,
  w: number,
  h: number,
  zoom: number,
  offX: number,
  offY: number,
  focal?: { x: number; y: number },
): void {
  const { sx, sy, sw, sh } = coverCrop(img.width, img.height, w, h, zoom, offX, offY, focal);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

/** wrap `text` into ≤maxLines lines fitting maxWidth at the current ctx.font */
function wrapLines(ctx: Ctx2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  // remaining words (if we hit the line cap) collapse into the last line
  const used = lines.join(' ').split(/\s+/).filter(Boolean).length;
  const rest = words.slice(used).join(' ');
  if (rest) lines.push(rest);
  else if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function drawCenteredText(
  ctx: Ctx2D,
  text: string,
  cx: number,
  y: number,
  font: string,
  color: string,
  letterSpacing: number,
): number {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  const spacer = ctx as unknown as { letterSpacing?: string };
  const supportsSpacing = typeof spacer.letterSpacing === 'string';
  if (letterSpacing && !supportsSpacing) {
    // manual per-glyph centering (Safari < 17.4, no ctx.letterSpacing)
    const total =
      [...text].reduce((s, ch) => s + ctx.measureText(ch).width, 0) +
      Math.max(0, text.length - 1) * letterSpacing;
    let x = cx - total / 2;
    ctx.textAlign = 'left';
    for (const ch of text) {
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + letterSpacing;
    }
  } else {
    if (letterSpacing && supportsSpacing) spacer.letterSpacing = `${letterSpacing}px`;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, y);
    if (supportsSpacing) spacer.letterSpacing = '0px';
  }
  return ctx.measureText(text).width;
}

/** cover card: gradient + title (wrapped) + subtitle, with an entrance ease. */
function drawCover(ctx: Ctx2D, doc: ReelDoc, localT: number): void {
  const { width: w, height: h } = doc;
  paintBackground(ctx, doc.background, w, h);
  // vignette for text legibility
  const vg = ctx.createLinearGradient(0, h * 0.35, 0, h);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  const intro = easeInOut(clamp(localT * 2.4, 0, 1));
  const rise = (1 - intro) * 40;
  ctx.save();
  ctx.globalAlpha = intro;

  const titleSize = 108;
  ctx.font = `700 ${titleSize}px "${doc.font.title}"`;
  const lines = wrapLines(ctx, doc.title || 'Untitled', w * 0.82, 3);
  const titleLineH = titleSize * 1.06;
  const blockH = lines.length * titleLineH;
  let ty = h * 0.52 - blockH / 2 + titleSize + rise;
  for (const line of lines) {
    drawCenteredText(ctx, line, w / 2, ty, `700 ${titleSize}px "${doc.font.title}"`, doc.ink.title, 0);
    ty += titleLineH;
  }

  if (doc.subtitle) {
    drawCenteredText(
      ctx,
      doc.subtitle.toUpperCase(),
      w / 2,
      ty + 24,
      `500 40px "${doc.font.body}"`,
      doc.ink.accent,
      8,
    );
  }
  ctx.restore();
}

function drawOutro(ctx: Ctx2D, doc: ReelDoc, localT: number): void {
  const { width: w, height: h } = doc;
  paintBackground(ctx, doc.background, w, h);
  const intro = easeInOut(clamp(localT * 2.2, 0, 1));
  ctx.save();
  ctx.globalAlpha = intro;
  drawCenteredText(
    ctx,
    doc.outroPrimary,
    w / 2,
    h * 0.48,
    `600 150px "${doc.font.outro}"`,
    doc.ink.title,
    0,
  );
  if (doc.outroSecondary) {
    drawCenteredText(
      ctx,
      doc.outroSecondary,
      w / 2,
      h * 0.58,
      `400 34px "${doc.font.body}"`,
      doc.ink.accent,
      2,
    );
  }
  ctx.restore();
}

function drawSlide(ctx: Ctx2D, doc: ReelDoc, slideIndex: number, localT: number, res: ReelResources): void {
  const { width: w, height: h } = doc;
  const slide = doc.slides[slideIndex];
  const img = slide ? res.images.get(slide.photoId) : undefined;
  if (!img) {
    // photo not loaded — fall back to the theme background so a frame still reads
    paintBackground(ctx, doc.background, w, h);
    return;
  }
  const m = slideMotionAt(slide.motion, localT);
  drawPhotoCover(ctx, img, w, h, m.zoom, m.offX, m.offY, slide.focal);
}

/** draw a single segment fully (no transition), at its own local progress. */
function drawSegment(ctx: Ctx2D, doc: ReelDoc, seg: ReelSegment, localT: number, res: ReelResources): void {
  if (seg.kind === 'cover') drawCover(ctx, doc, localT);
  else if (seg.kind === 'outro') drawOutro(ctx, doc, localT);
  else drawSlide(ctx, doc, seg.slideIndex, localT, res);
}

/**
 * Blend the incoming segment (`cur`) over the frozen final frame of the
 * previous one (`prev`) at transition progress p (0..1). The previous segment
 * is drawn at localT=1 (its last frame), the incoming at its own small localT.
 */
function drawTransition(
  ctx: Ctx2D,
  doc: ReelDoc,
  prev: ReelSegment,
  cur: ReelSegment,
  p: number,
  curLocalT: number,
  res: ReelResources,
): void {
  const { width: w, height: h } = doc;
  const type = cur.transition;

  if (type === 'dip') {
    const color = backgroundColor(doc.background);
    if (p < 0.5) {
      drawSegment(ctx, doc, prev, 1, res);
      ctx.save();
      ctx.globalAlpha = clamp(p * 2, 0, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else {
      drawSegment(ctx, doc, cur, curLocalT, res);
      ctx.save();
      ctx.globalAlpha = clamp((1 - p) * 2, 0, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    return;
  }

  if (type === 'whip') {
    const e = easeInOut(p);
    // prev slides out to the left; current slides in from the right
    ctx.save();
    ctx.translate(-e * w, 0);
    drawSegment(ctx, doc, prev, 1, res);
    ctx.restore();
    // motion-blur the incoming with a few low-alpha stacked draws (no ctx.filter)
    const steps = 3;
    for (let i = steps; i >= 0; i--) {
      const trail = (i / steps) * (1 - e) * w * 0.4;
      ctx.save();
      ctx.globalAlpha = i === 0 ? 1 : 0.18;
      ctx.translate((1 - e) * w + trail, 0);
      drawSegment(ctx, doc, cur, curLocalT, res);
      ctx.restore();
    }
    return;
  }

  // crossfade (default): prev opaque, current faded in on top
  drawSegment(ctx, doc, prev, 1, res);
  ctx.save();
  ctx.globalAlpha = easeInOut(p);
  drawSegment(ctx, doc, cur, curLocalT, res);
  ctx.restore();
}

/**
 * Draw the reel frame at absolute time `tMs`. The ONE renderer both the player
 * and the exporter call. `res` supplies decoded photo bitmaps by id.
 */
export function drawReelFrame(ctx: Ctx2D, doc: ReelDoc, tMs: number, res: ReelResources): void {
  const { width: w, height: h } = doc;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const segs = buildTimeline(doc);
  if (!segs.length) return;
  const { index, seg, localMs, localT } = segmentAt(segs, tMs);
  const transMs = doc.transitionMs;

  if (index > 0 && localMs < transMs && transMs > 0) {
    const prev = segs[index - 1];
    const p = clamp(localMs / transMs, 0, 1);
    drawTransition(ctx, doc, prev, seg, p, localT, res);
  } else {
    drawSegment(ctx, doc, seg, localT, res);
  }
}
