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
import { encodeCanvasToMp4, webcodecsAvailable } from '../video/mp4';
import { renderVibeBed } from '../audio/synth';
import { drawReelFrame } from './reelFrame';
import type { ReelResources } from './reelFrame';
import type { ReelDoc } from './reelDoc';

/** Video export works if EITHER the WebCodecs MP4 path or MediaRecorder is available. */
export function reelExportSupported(): boolean {
  return webcodecsAvailable() || videoExportSupported();
}

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

/** add a pre-resolved soundtrack buffer to the capture stream; returns cleanup. */
function attachAudio(buffer: AudioBuffer | null, stream: MediaStream): () => void {
  if (!buffer) return () => {};
  const AC: AudioCtor | undefined =
    (typeof AudioContext !== 'undefined' && AudioContext) ||
    (typeof window !== 'undefined' &&
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) ||
    undefined;
  if (!AC) return () => {};
  try {
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
 * Export the reel to a video Blob. Prefers a frame-exact H.264/AAC **MP4** via
 * WebCodecs (smooth, deterministic, universally social-media/iOS-postable);
 * falls back to real-time MediaRecorder capture where WebCodecs is unavailable.
 * Loads its own resources unless `opts.resources` is supplied.
 */
export async function exportReelVideo(
  doc: ReelDoc,
  opts: ReelExportOptions = {},
): Promise<{ name: string; blob: Blob }> {
  const fps = opts.fps ?? 30;
  const ownResources = !opts.resources;
  const res = opts.resources ?? (await loadReelResources(doc, false));

  // resolve the soundtrack ONCE (both paths need the concrete buffer)
  const audioBuffer = opts.muted
    ? null
    : (opts.audioBuffer ?? (await renderVibeBed(doc.vibe, doc.durationMs).catch(() => null)));

  // fonts must be ready or the cover/outro draw in a fallback face
  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
  } catch {
    /* non-DOM env — ignore */
  }

  try {
    // --- preferred path: frame-exact MP4 via WebCodecs ---------------------
    if (webcodecsAvailable()) {
      const blob = await encodeCanvasToMp4({
        width: doc.width,
        height: doc.height,
        fps,
        durationMs: doc.durationMs,
        draw: (ctx, tMs) => drawReelFrame(ctx as CanvasRenderingContext2D, doc, tMs, res),
        audioBuffer,
        videoBitrate: 10_000_000,
        onProgress: opts.onProgress,
        signal: opts.signal,
      });
      if (blob) return { name: `${slug(doc.name)}-reel.mp4`, blob };
      // null → fall through to MediaRecorder
    }

    // --- fallback: real-time MediaRecorder capture -------------------------
    const mimeType = pickMimeType();
    if (!mimeType) throw new Error('This browser cannot record video');

    const canvas = document.createElement('canvas');
    canvas.width = doc.width;
    canvas.height = doc.height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';

    const stream = canvas.captureStream(fps);
    const stopAudio = attachAudio(audioBuffer, stream);
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
          if (opts.signal?.aborted) return resolve();
          const elapsed = performance.now() - start;
          if (elapsed >= doc.durationMs) {
            drawReelFrame(ctx, doc, doc.durationMs - 1, res);
            return resolve();
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
    }
  } finally {
    if (ownResources) releaseReelResources(res);
  }
}
