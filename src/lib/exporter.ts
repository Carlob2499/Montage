// ---------------------------------------------------------------------------
// Export orchestration: load full-res resources, render panels/tiles, encode
// PNG/JPEG, bundle ZIPs with captions. All output is sRGB at exact
// Instagram-native resolutions.
// ---------------------------------------------------------------------------

import JSZip from 'jszip';
import { db } from '../db/db';
import { normalizeStack } from './editStack';
import type { ProjectDoc } from '../types';
import { decodeImage } from './imageUtils';
import { gridUploadOrder } from './slicer';
import { renderGridTile, renderPanel, renderRegion } from './renderer';
import type { RenderResources } from './renderer';
import { canvasSize } from './slicer';

export interface ExportOptions {
  format: 'image/png' | 'image/jpeg';
  /** 0..1, JPEG only */
  quality: number;
  onProgress?: (done: number, total: number) => void;
}

export interface ExportedFile {
  name: string;
  blob: Blob;
}

/**
 * The decode scale a photo actually needs for a 1:1 export: the largest
 * cover-fit scale across every layer using it (accounting for the stack crop
 * and in-frame zoom). Decoding beyond this adds memory without adding pixels
 * to the output.
 */
function neededDecodeScale(
  doc: ProjectDoc,
  photoId: string,
  srcW: number,
  srcH: number,
  stack?: import('../types').EditStack,
): number {
  let effW = srcW;
  let effH = srcH;
  const crop = stack?.crop;
  if (crop) {
    effW = Math.max(1, crop.width * srcW);
    effH = Math.max(1, crop.height * srcH);
    if (crop.rotate === 90 || crop.rotate === 270) [effW, effH] = [effH, effW];
  }
  let scale = 0;
  for (const layer of doc.layers) {
    if (layer.type !== 'photo' || layer.photoId !== photoId) continue;
    const cover = Math.max(layer.width / effW, layer.height / effH) * Math.max(1, layer.imgScale);
    scale = Math.max(scale, cover);
  }
  if (doc.background.kind === 'blurPhoto' && doc.background.photoId === photoId) {
    // backdrop renders at ≤1600px — tiny requirement
    scale = Math.max(scale, 1600 / Math.max(srcW, srcH));
  }
  // 1.25 headroom for resampling quality; cap at 1 (never upscale the decode)
  return Math.min(1, scale * 1.25);
}

async function decodeScaled(
  blob: Blob,
  targetW: number,
  srcW: number,
  orientation?: number,
): Promise<ImageBitmap> {
  if (targetW >= srcW || targetW <= 0) return decodeImage(blob, orientation);
  try {
    return await createImageBitmap(blob, {
      imageOrientation: 'from-image',
      resizeWidth: Math.round(targetW),
      resizeQuality: 'high',
    });
  } catch {
    // resize options unsupported — fall back to a full decode
    return decodeImage(blob, orientation);
  }
}

/**
 * Load bitmaps + edit stacks for every photo a doc uses. Pass
 * `useProxies` for fast screen-resolution rendering (swipe preview);
 * exports use originals, downscaled at decode to what the layout needs.
 * On failure, everything already decoded is released before rethrowing.
 */
export async function loadResources(
  doc: ProjectDoc,
  useProxies = false,
  withVideos = false,
): Promise<RenderResources> {
  const photoIds = new Set<string>();
  const stickerIds = new Set<string>();
  for (const layer of doc.layers) {
    if (layer.type === 'photo' && layer.photoId) photoIds.add(layer.photoId);
    if (layer.type === 'sticker') stickerIds.add(layer.stickerId);
  }
  if (doc.background.kind === 'blurPhoto') photoIds.add(doc.background.photoId);

  const photos = new Map<string, { bitmap: ImageBitmap; stack?: import('../types').EditStack }>();
  const stickers = new Map<string, ImageBitmap>();
  const resources: RenderResources = { photos, stickers };
  if (withVideos) resources.videos = new Map();

  try {
    for (const id of photoIds) {
      const record = await db.photos.get(id);
      // video cells render their poster frame (full-size poster lives in
      // proxies; thumbs is the fallback for pre-existing imports)
      const row =
        record?.kind === 'video'
          ? ((await db.proxies.get(id)) ?? (await db.thumbs.get(id)))
          : ((useProxies ? await db.proxies.get(id) : null) ?? (await db.originals.get(id)));
      if (!row) continue;
      const edit = await db.edits.get(id);
      const stack = edit ? normalizeStack(edit.stack) : undefined;
      let bitmap: ImageBitmap;
      if (!useProxies && record && record.kind === 'image') {
        const scale = neededDecodeScale(doc, id, record.width, record.height, stack);
        bitmap = await decodeScaled(row.blob, record.width * scale, record.width, record.orientation);
      } else {
        bitmap = await decodeImage(row.blob);
      }
      photos.set(id, { bitmap, stack });

      // motion export: also load the original clip as a playable element
      if (withVideos && record?.kind === 'video') {
        const orig = await db.originals.get(id);
        if (orig) {
          const el = await loadVideoElement(orig.blob).catch(() => null);
          if (el) resources.videos!.set(id, el);
        }
      }
    }

    for (const id of stickerIds) {
      const row = await db.stickers.get(id);
      if (row) stickers.set(id, await decodeImage(row.blob));
    }
  } catch (err) {
    releaseResources(resources);
    throw err;
  }

  return resources;
}

/** Load a muted, looping video element ready to render frames (iOS-safe). */
function loadVideoElement(blob: Blob): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(blob);
  const el = document.createElement('video');
  el.muted = true;
  el.loop = true;
  el.playsInline = true;
  el.preload = 'auto';
  el.src = url;
  el.load();
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Video load timed out')), 10_000);
    el.onloadeddata = () => {
      clearTimeout(timer);
      resolve(el);
    };
    el.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Could not decode video'));
    };
  });
}

export function releaseResources(res: RenderResources): void {
  for (const { bitmap } of res.photos.values()) bitmap.close();
  for (const bmp of res.stickers.values()) bmp.close();
  if (res.videos) {
    for (const el of res.videos.values()) {
      el.pause();
      const src = el.src;
      el.removeAttribute('src');
      el.load();
      if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    }
    res.videos.clear();
  }
}

async function encode(canvas: OffscreenCanvas, opts: ExportOptions): Promise<Blob> {
  return canvas.convertToBlob({
    type: opts.format,
    quality: opts.format === 'image/jpeg' ? opts.quality : undefined,
  });
}

const ext = (opts: ExportOptions) => (opts.format === 'image/png' ? 'png' : 'jpg');
const pad = (n: number) => String(n).padStart(2, '0');

/** Export selected panels (or all) as numbered files. */
export async function exportPanels(
  doc: ProjectDoc,
  opts: ExportOptions,
  panelIndexes?: number[],
): Promise<ExportedFile[]> {
  const indexes = panelIndexes ?? Array.from({ length: doc.panelCount }, (_, i) => i);
  const resources = await loadResources(doc);
  try {
    const files: ExportedFile[] = [];
    for (let i = 0; i < indexes.length; i++) {
      const idx = indexes[i];
      const canvas = renderPanel(doc, idx, resources);
      const blob = await encode(canvas, opts);
      files.push({ name: `${slug(doc.name)}-${pad(idx + 1)}.${ext(opts)}`, blob });
      opts.onProgress?.(i + 1, indexes.length);
    }
    return files;
  } finally {
    releaseResources(resources);
  }
}

/** Export the 3×N profile grid as tiles named in correct upload order. */
export async function exportGridTiles(
  doc: ProjectDoc,
  opts: ExportOptions,
): Promise<ExportedFile[]> {
  const order = gridUploadOrder(doc.panelCount);
  const resources = await loadResources(doc);
  try {
    const files: ExportedFile[] = [];
    for (let i = 0; i < order.length; i++) {
      const { row, col } = order[i];
      const canvas = renderGridTile(doc, row, col, resources);
      const blob = await encode(canvas, opts);
      files.push({
        name: `${slug(doc.name)}-upload-${pad(i + 1)}-r${row + 1}c${col + 1}.${ext(opts)}`,
        blob,
      });
      opts.onProgress?.(i + 1, order.length);
    }
    return files;
  } finally {
    releaseResources(resources);
  }
}

/**
 * Safe single-canvas pixel budget. iOS Safari caps canvas area around
 * 16.7 megapixels — exceeding it yields a silently blank canvas.
 */
const MAX_CANVAS_AREA = 16_000_000;

/**
 * Export the whole canvas as one panorama image, downscaled if the full
 * resolution would exceed mobile canvas limits. Returns the applied scale so
 * the UI can tell the user.
 */
export async function exportPanorama(
  doc: ProjectDoc,
  opts: ExportOptions,
): Promise<ExportedFile & { scale: number }> {
  const resources = await loadResources(doc);
  try {
    const { width, height } = canvasSize(doc);
    const scale = Math.min(1, Math.sqrt(MAX_CANVAS_AREA / (width * height)));
    const canvas = renderRegion(doc, { x: 0, y: 0, width, height }, resources, scale);
    const blob = await encode(canvas, opts);
    return { name: `${slug(doc.name)}-panorama.${ext(opts)}`, blob, scale };
  } finally {
    releaseResources(resources);
  }
}

/** Bundle files + captions into a single ZIP. */
export async function bundleZip(
  doc: ProjectDoc,
  files: ExportedFile[],
): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  const count = doc.mode === 'grid' ? 1 : doc.panelCount;
  const captions = doc.captions
    .slice(0, count)
    .map((c, i) => `--- Panel ${i + 1} ---\n${c || '(no caption)'}`)
    .join('\n\n');
  zip.file(`${slug(doc.name)}-captions.txt`, captions);
  return zip.generateAsync({ type: 'blob' });
}

export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'montage'
  );
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
