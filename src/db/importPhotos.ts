// ---------------------------------------------------------------------------
// Photo import pipeline: EXIF extraction, HEIC normalization, thumbnail +
// editing-proxy generation, duplicate flagging. Runs entirely on-device.
// ---------------------------------------------------------------------------

import exifr from 'exifr';
import { db, uid } from './db';
import type { PhotoRecord } from '../types';
import {
  decodeImage,
  isHeic,
  makeScaledImage,
  normalizeImageBlob,
  PROXY_SIZE,
  THUMB_SIZE,
} from '../lib/imageUtils';
import { findDuplicates } from '../lib/photoSort';

export interface ImportResult {
  imported: PhotoRecord[];
  errors: { fileName: string; message: string }[];
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];

export function isSupportedFile(file: File): boolean {
  return (
    IMAGE_TYPES.includes(file.type.toLowerCase()) ||
    VIDEO_TYPES.includes(file.type.toLowerCase()) ||
    isHeic(file)
  );
}

async function extractExif(file: File): Promise<{
  dateTaken?: number;
  orientation?: number;
  gps?: { lat: number; lng: number };
}> {
  try {
    const data = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'Orientation', 'latitude', 'longitude'],
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
    const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const bmp = await createImageBitmap(canvas);
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
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function importFiles(files: File[], albumId: string): Promise<ImportResult> {
  const imported: PhotoRecord[] = [];
  const errors: { fileName: string; message: string }[] = [];
  const existing = await db.photos.where('albumId').equals(albumId).toArray();
  let order = existing.reduce((m, p) => Math.max(m, p.order), 0) + 1;

  for (const file of files) {
    if (!isSupportedFile(file)) {
      errors.push({
        fileName: file.name,
        message: 'Unsupported format — use JPEG, PNG, WebP, HEIC, MP4 or WebM.',
      });
      continue;
    }
    try {
      const id = uid();
      const isVideo = VIDEO_TYPES.includes(file.type.toLowerCase());
      const exif = await extractExif(file);

      let width: number;
      let height: number;
      let thumbBlob: Blob;
      let proxyBlob: Blob | undefined;
      let storedBlob: Blob = file;

      if (isVideo) {
        const poster = await videoPoster(file);
        width = poster.width;
        height = poster.height;
        thumbBlob = poster.thumb;
        proxyBlob = poster.poster;
      } else {
        storedBlob = await normalizeImageBlob(file);
        const bitmap = await decodeImage(storedBlob);
        width = bitmap.width;
        height = bitmap.height;
        // PNG/WebP may carry transparency — JPEG proxies would turn it black
        const hasAlpha = /png|webp/i.test(storedBlob.type || file.type);
        const [thumb, proxy] = await Promise.all([
          makeScaledImage(bitmap, THUMB_SIZE, 0.8, hasAlpha),
          makeScaledImage(bitmap, PROXY_SIZE, 0.87, hasAlpha),
        ]);
        thumbBlob = thumb.blob;
        proxyBlob = proxy.blob;
        bitmap.close();
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
        order: order++,
        kind: isVideo ? 'video' : 'image',
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
        fileName: file.name,
        message: err instanceof Error ? err.message : 'Import failed',
      });
    }
  }

  // re-run duplicate detection across the album
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

  return { imported, errors };
}
