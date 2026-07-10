// ---------------------------------------------------------------------------
// Export orchestration: load full-res resources, render panels/tiles, encode
// PNG/JPEG, bundle ZIPs with captions. All output is sRGB at exact
// Instagram-native resolutions.
// ---------------------------------------------------------------------------

import JSZip from 'jszip';
import { db } from '../db/db';
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

/** Load full-resolution bitmaps + edit stacks for every photo a doc uses. */
export async function loadResources(doc: ProjectDoc): Promise<RenderResources> {
  const photoIds = new Set<string>();
  const stickerIds = new Set<string>();
  for (const layer of doc.layers) {
    if (layer.type === 'photo' && layer.photoId) photoIds.add(layer.photoId);
    if (layer.type === 'sticker') stickerIds.add(layer.stickerId);
  }
  if (doc.background.kind === 'blurPhoto') photoIds.add(doc.background.photoId);

  const photos = new Map<string, { bitmap: ImageBitmap; stack?: import('../types').EditStack }>();
  for (const id of photoIds) {
    const row = await db.originals.get(id);
    if (!row) continue;
    const record = await db.photos.get(id);
    if (record?.kind === 'video') continue; // video cells export as poster via proxy path later
    const bitmap = await decodeImage(row.blob);
    const edit = await db.edits.get(id);
    photos.set(id, { bitmap, stack: edit?.stack });
  }

  const stickers = new Map<string, ImageBitmap>();
  for (const id of stickerIds) {
    const row = await db.stickers.get(id);
    if (row) stickers.set(id, await decodeImage(row.blob));
  }

  return { photos, stickers };
}

export function releaseResources(res: RenderResources): void {
  for (const { bitmap } of res.photos.values()) bitmap.close();
  for (const bmp of res.stickers.values()) bmp.close();
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

/** Export the whole canvas as one full-resolution panorama image. */
export async function exportPanorama(
  doc: ProjectDoc,
  opts: ExportOptions,
): Promise<ExportedFile> {
  const resources = await loadResources(doc);
  try {
    const { width, height } = canvasSize(doc);
    const canvas = renderRegion(doc, { x: 0, y: 0, width, height }, resources);
    const blob = await encode(canvas, opts);
    return { name: `${slug(doc.name)}-panorama.${ext(opts)}`, blob };
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
  const captions = doc.captions
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
