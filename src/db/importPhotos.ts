// ---------------------------------------------------------------------------
// Photo import pipeline: EXIF extraction, HEIC normalization, thumbnail +
// editing-proxy generation, duplicate flagging. Runs entirely on-device.
// ---------------------------------------------------------------------------

import exifr from 'exifr';
import { db, uid } from './db';
import type { PhotoRecord } from '../types';
import {
  decodeImageBounded,
  importResizeWidth,
  isHeic,
  makeCanvas,
  makeScaledImage,
  normalizeImageBlob,
  PROXY_SIZE,
  THUMB_SIZE,
} from '../lib/imageUtils';
import { findDuplicates } from '../lib/photoSort';

/**
 * Run `fn` over items with at most `limit` in flight at once. Keeps large
 * imports fast (decode of one photo overlaps the canvas work of another)
 * without unbounded memory — the enemy that made whole-album imports OOM.
 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

/** Stable for the page lifetime — deviceMemory is a read-once browser property. */
const IMPORT_CONCURRENCY = (() => {
  if (typeof navigator === 'undefined') return 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof mem === 'number' && mem > 0 && mem <= 4 ? 2 : 4;
})();

export interface ImportResult {
  imported: PhotoRecord[];
  errors: { fileName: string; message: string }[];
}

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif|tiff?)$/i;

/**
 * Classify an incoming file. Deliberately permissive: iPhones hand over
 * video/quicktime .mov files, sometimes with an EMPTY mime type — classify by
 * extension too, and let any image/* through (the decoder is the real gate,
 * and it reports a per-file error when it can't handle one).
 */
export function classifyFile(file: Pick<File, 'name' | 'type'>): 'image' | 'video' | null {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('video/')) {
    return VIDEO_TYPES.includes(type) || VIDEO_EXT.test(file.name) ? 'video' : null;
  }
  if (type.startsWith('image/')) return 'image';
  // no mime type — fall back to the extension
  if (VIDEO_EXT.test(file.name)) return 'video';
  if (IMAGE_EXT.test(file.name)) return 'image';
  return null;
}

export function isSupportedFile(file: File): boolean {
  return classifyFile(file) !== null || isHeic(file);
}

async function extractExif(file: File): Promise<{
  dateTaken?: number;
  orientation?: number;
  gps?: { lat: number; lng: number };
  /** stored pixel dims (pre-orientation) — lets us decode bounded without a
   *  full-res decode first */
  imageWidth?: number;
  imageHeight?: number;
}> {
  try {
    const data = await exifr.parse(file, {
      pick: [
        'DateTimeOriginal',
        'CreateDate',
        'Orientation',
        'latitude',
        'longitude',
        'ExifImageWidth',
        'ExifImageHeight',
      ],
    });
    if (!data) return {};
    const date: Date | undefined = data.DateTimeOriginal ?? data.CreateDate;
    return {
      dateTaken: date instanceof Date && !isNaN(date.getTime()) ? date.getTime() : undefined,
      orientation: typeof data.Orientation === 'number' ? data.Orientation : undefined,
      gps:
        typeof data.latitude === 'number' && typeof data.longitude === 'number'
          ? { lat: data.latitude, lng: data.longitude }
          : undefined,
      imageWidth: typeof data.ExifImageWidth === 'number' ? data.ExifImageWidth : undefined,
      imageHeight: typeof data.ExifImageHeight === 'number' ? data.ExifImageHeight : undefined,
    };
  } catch {
    return {};
  }
}

async function videoPoster(file: File): Promise<{
  thumb: Blob;
  poster: Blob;
  width: number;
  height: number;
  duration?: number;
}> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  try {
    video.muted = true;
    video.playsInline = true;
    // 'auto' — iOS Safari never reaches HAVE_CURRENT_DATA with preload=metadata
    video.preload = 'auto';
    video.src = url;
    video.load();

    // every wait is bounded — a video that never produces a frame must fail
    // the ONE file, not hang the whole import batch
    const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Video ${what} timed out`)), ms),
        ),
      ]);

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Could not decode video'));
      }),
      10_000,
      'decode',
    );

    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(0.5, video.duration / 2);
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve();
          video.onerror = () => reject(new Error('Video seek failed'));
        }),
        5_000,
        'seek',
      );
    }

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('Video has no visible frames');
    }
    const { canvas, ctx } = makeCanvas(video.videoWidth, video.videoHeight);
    ctx.drawImage(video, 0, 0);
    const bmp = await createImageBitmap(canvas as CanvasImageSource);
    // full-size poster (stored as the proxy) keeps exports sharp; the thumb
    // is only for the library grid
    const [thumb, poster] = await Promise.all([
      makeScaledImage(bmp, THUMB_SIZE),
      makeScaledImage(bmp, PROXY_SIZE, 0.9),
    ]);
    bmp.close();
    return {
      thumb: thumb.blob,
      poster: poster.blob,
      width: video.videoWidth,
      height: video.videoHeight,
      duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function importFiles(
  files: File[],
  albumId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const imported: PhotoRecord[] = [];
  const errors: { fileName: string; message: string }[] = [];
  const existing = await db.photos.where('albumId').equals(albumId).toArray();
  const orderBase = existing.reduce((m, p) => Math.max(m, p.order), 0) + 1;
  let done = 0;

  // One photo's full import: EXIF → bounded decode → thumb+proxy → DB write.
  // `order` is derived from the file's index (not a shared counter) so parallel
  // workers never race on it.
  const processOne = async (file: File, index: number): Promise<void> => {
    const kind = classifyFile(file) ?? (isHeic(file) ? 'image' : null);
    if (kind === null) {
      errors.push({
        fileName: file.name || 'unnamed file',
        message: 'Unsupported format — photos (JPEG/PNG/WebP/HEIC) and clips (MP4/MOV/WebM) work.',
      });
      onProgress?.(++done, files.length);
      return;
    }
    try {
      const id = uid();
      const isVideo = kind === 'video';
      const exif = await extractExif(file);

      let width: number;
      let height: number;
      let thumbBlob: Blob;
      let proxyBlob: Blob | undefined;
      let storedBlob: Blob = file;
      let duration: number | undefined;

      if (isVideo) {
        const poster = await videoPoster(file);
        width = poster.width;
        height = poster.height;
        thumbBlob = poster.thumb;
        proxyBlob = poster.poster;
        duration = poster.duration;
      } else {
        storedBlob = await normalizeImageBlob(file);
        // decode DOWNSCALED to the proxy size — never allocate the full-res
        // bitmap just to shrink it (the OOM/jank cause on big-album imports)
        const resizeW = importResizeWidth(exif.imageWidth, exif.imageHeight, PROXY_SIZE, exif.orientation);
        const bitmap = await decodeImageBounded(storedBlob, resizeW, exif.orientation);
        const decodedW = bitmap.width;
        const decodedH = bitmap.height;
        // PNG/WebP may carry transparency — JPEG proxies would turn it black
        const hasAlpha = /png|webp|avif/i.test(storedBlob.type || file.type);
        const [thumb, proxy] = await Promise.all([
          makeScaledImage(bitmap, THUMB_SIZE, 0.8, hasAlpha),
          makeScaledImage(bitmap, PROXY_SIZE, 0.87, hasAlpha),
        ]);
        thumbBlob = thumb.blob;
        proxyBlob = proxy.blob;
        bitmap.close();
        // store the TRUE full-res dimensions (the bounded bitmap is smaller):
        // prefer EXIF's stored dims, orientation-swapped for 90°/270° rotations
        if (exif.imageWidth && exif.imageHeight) {
          const swap = !!exif.orientation && exif.orientation >= 5 && exif.orientation <= 8;
          width = swap ? exif.imageHeight : exif.imageWidth;
          height = swap ? exif.imageWidth : exif.imageHeight;
        } else {
          width = decodedW;
          height = decodedH;
        }
      }

      const record: PhotoRecord = {
        id,
        albumId,
        fileName: file.name,
        mimeType: storedBlob.type || file.type,
        byteSize: file.size,
        width,
        height,
        dateTaken: exif.dateTaken ?? (file.lastModified || undefined),
        dateAdded: Date.now(),
        orientation: exif.orientation,
        gps: exif.gps,
        tags: [],
        order: orderBase + index,
        kind: isVideo ? 'video' : 'image',
        duration,
      };

      await db.transaction(
        'rw',
        [db.photos, db.originals, db.proxies, db.thumbs],
        async () => {
          await db.photos.add(record);
          await db.originals.add({ id, blob: storedBlob });
          await db.thumbs.add({ id, blob: thumbBlob });
          if (proxyBlob) await db.proxies.add({ id, blob: proxyBlob });
        },
      );
      imported.push(record);
    } catch (err) {
      errors.push({
        fileName: file.name || 'unnamed file',
        message: err instanceof Error ? err.message : 'Import failed',
      });
    }
    onProgress?.(++done, files.length);
  };

  await mapPool(files, IMPORT_CONCURRENCY, processOne);
  // preserve the picker's order even though workers finish out of order
  imported.sort((a, b) => a.order - b.order);

  // re-run duplicate detection across the album — never let this housekeeping
  // step turn a successful import into a silent failure
  try {
    const all = await db.photos.where('albumId').equals(albumId).toArray();
    const dupes = findDuplicates(all);
    await db.transaction('rw', db.photos, async () => {
      for (const p of all) {
        const flag = dupes.get(p.id);
        if (flag !== p.duplicateOf) {
          await db.photos.update(p.id, { duplicateOf: flag });
        }
      }
    });
  } catch {
    /* duplicate flags are advisory */
  }

  return { imported, errors };
}
