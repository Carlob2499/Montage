// ---------------------------------------------------------------------------
// Reel export: drive drawReelFrame in real time onto a 1080×1920 canvas and
// capture it via captureStream + MediaRecorder (mirrors motion/panorama export
// — real-time, so a 20s reel takes 20s). Codec is feature-detected (MP4 on
// Safari, WebM elsewhere). Also loads the decoded photo bitmaps a reel needs.
// ---------------------------------------------------------------------------

import { db } from '../../db/db';
import { decodeImage } from '../imageUtils';
import { slug } from '../exporter';
import { pickMimeType, videoExportSupported } from '../videoExport';
import { renderVibeBed } from '../audio/synth';
import { drawReelFrame } from './reelFrame';
import type { ReelResources } from './reelFrame';
import type { ReelDoc } from './reelDoc';

export { videoExportSupported as reelExportSupported };

/** Decode every photo a reel references (proxy for preview, original for export). */
export async function loadReelResources(doc: ReelDoc, useProxies = true): Promise<ReelResources> {
  const images = new Map<string, ImageBitmap>();
  const ids = new Set(doc.slides.map((s) => s.photoId));
  for (const id of ids) {
    // prefer the editing proxy (≤1600px — ample for a 1080-wide slide); fall
    // back to original then thumb so a reel always has something to show
    const row = useProxies
      ? (await db.proxies.get(id)) ?? (await db.originals.get(id)) ?? (await db.thumbs.get(id))
      : (await db.originals.get(id)) ?? (await db.proxies.get(id)) ?? (await db.thumbs.get(id));
    if (!row) continue;
    try {
      images.set(id, await decodeImage(row.blob));
    } catch {
      /* skip an undecodable image — the frame renderer falls back to the bg */
    }
  }
  return { images };
}

export function releaseReelResources(res: ReelResources): void {
  for (const bmp of res.images.values()) bmp.close();
  res.images.clear();
}

export interface ReelExportOptions {
  fps?: number;
  onProgress?: (fraction: number) => void;
  /** abort a long capture (user cancels) */
  signal?: AbortSignal;
  /** reuse already-decoded bitmaps (e.g. the player's) instead of re-loading */
  resources?: ReelResources;
  /** export without a soundtrack (default: the procedural vibe bed is muxed in) */
  muted?: boolean;
  /** user-supplied soundtrack, overriding the procedural bed */
  audioBuffer?: AudioBuffer | null;
}

type AudioCtor = typeof AudioContext;

/** add a soundtrack track to the capture stream; returns a cleanup fn. */
async function attachAudio(
  doc: ReelDoc,
  stream: MediaStream,
  opts: ReelExportOptions,
): Promise<() => void> {
  if (opts.muted) return () => {};
  const AC: AudioCtor | undefined =
    (typeof AudioContext !== 'undefined' && AudioContext) ||
    (typeof window !== 'undefined' &&
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) ||
    undefined;
  if (!AC) return () => {};
  try {
    const buffer = opts.audioBuffer ?? (await renderVibeBed(doc.vibe, doc.durationMs));
    if (!buffer) return () => {};
    const audioCtx = new AC();
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const dest = audioCtx.createMediaStreamDestination();
    src.connect(dest);
    src.start();
    for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
    return () => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      void audioCtx.close();
    };
  } catch {
    return () => {};
  }
}

/**
 * Record the reel to a video Blob. Loads its own full-res resources unless
 * `opts.resources` is supplied. Throws when the browser can't record canvas.
 */
export async function exportReelVideo(
  doc: ReelDoc,
  opts: ReelExportOptions = {},
): Promise<{ name: string; blob: Blob }> {
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error('This browser cannot record video');

  const fps = opts.fps ?? 30;
  const ownResources = !opts.resources;
  const res = opts.resources ?? (await loadReelResources(doc, false));

  // fonts must be ready or the cover/outro draw in a fallback face
  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
  } catch {
    /* non-DOM env — ignore */
  }

  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';

  const stream = canvas.captureStream(fps);
  const stopAudio = await attachAudio(doc, stream, opts);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error('Video recording failed'));
  });

  drawReelFrame(ctx, doc, 0, res);
  recorder.start(200);
  const start = performance.now();

  try {
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (opts.signal?.aborted) {
          resolve();
          return;
        }
        const elapsed = performance.now() - start;
        if (elapsed >= doc.durationMs) {
          drawReelFrame(ctx, doc, doc.durationMs - 1, res);
          resolve();
          return;
        }
        drawReelFrame(ctx, doc, elapsed, res);
        opts.onProgress?.(elapsed / doc.durationMs);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    recorder.stop();
    const blob = await done;
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    return { name: `${slug(doc.name)}-reel.${ext}`, blob };
  } finally {
    stopAudio();
    if (ownResources) releaseReelResources(res);
  }
}
