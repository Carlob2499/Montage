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
import { buildTimeline, segmentAt } from './reelDoc';
import type { ReelDoc } from './reelDoc';

/** Video export works if EITHER the WebCodecs MP4 path or MediaRecorder is available. */
export function reelExportSupported(): boolean {
  return webcodecsAvailable() || videoExportSupported();
}

/** A muted, seekable <video> ready to render frames (iOS-safe). */
function loadReelVideo(blob: Blob): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(blob);
  const el = document.createElement('video');
  el.muted = true; // clip audio is a deliberate non-goal — the music bed wins
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

/**
 * Decode the still (poster) for every slide AND load a live <video> element for
 * each video slide. Video slides draw the moving clip; the poster is the
 * fallback if a clip won't decode. `useProxies` picks proxy-vs-original for the
 * still; video clips always come from the untouched original.
 */
export async function loadReelResources(doc: ReelDoc, useProxies = true): Promise<ReelResources> {
  const images = new Map<string, ImageBitmap>();
  const videos = new Map<string, HTMLVideoElement>();
  const videoIds = new Set(doc.slides.filter((s) => s.kind === 'video').map((s) => s.photoId));
  const ids = new Set(doc.slides.map((s) => s.photoId));
  for (const id of ids) {
    const isVideo = videoIds.has(id);
    // still/poster: a video's proxy IS its poster JPEG, so decode that (never the
    // original video blob, which decodeImage can't read); photos follow useProxies
    const posterRow = isVideo
      ? (await db.proxies.get(id)) ?? (await db.thumbs.get(id))
      : useProxies
        ? (await db.proxies.get(id)) ?? (await db.originals.get(id)) ?? (await db.thumbs.get(id))
        : (await db.originals.get(id)) ?? (await db.proxies.get(id)) ?? (await db.thumbs.get(id));
    if (posterRow) {
      try {
        images.set(id, await decodeImage(posterRow.blob));
      } catch {
        /* skip an undecodable still — the clip or bg carries the frame */
      }
    }
    if (isVideo) {
      const orig = await db.originals.get(id);
      if (orig) {
        const el = await loadReelVideo(orig.blob).catch(() => null);
        if (el) videos.set(id, el);
      }
    }
  }
  return { images, videos };
}

export function releaseReelResources(res: ReelResources): void {
  for (const bmp of res.images.values()) bmp.close();
  res.images.clear();
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

/** Seek a video element to `t` seconds and resolve when the frame is ready. */
function seekVideo(vid: HTMLVideoElement, t: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (Math.abs(vid.currentTime - t) < 0.004) return resolve();
    const done = () => {
      vid.removeEventListener('seeked', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 400);
    vid.addEventListener('seeked', done);
    try {
      vid.currentTime = t;
    } catch {
      done();
    }
  });
}

/**
 * Before drawing the export frame at `tMs`, seek the active video slide's clip
 * to the matching moment (looping if the clip is shorter than the segment).
 * No-op when the current segment isn't a video slide.
 */
async function seekReelForFrame(doc: ReelDoc, tMs: number, res: ReelResources): Promise<void> {
  if (!res.videos || res.videos.size === 0) return;
  const { seg, localMs } = segmentAt(buildTimeline(doc), tMs);
  if (seg.kind !== 'slide') return;
  const slide = doc.slides[seg.slideIndex];
  if (!slide || slide.kind !== 'video') return;
  const vid = res.videos.get(slide.photoId);
  if (!vid || vid.readyState < 1) return;
  const clipMs =
    slide.clipDurationMs ??
    (Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration * 1000 : seg.durationMs);
  const target = clipMs > 0 ? localMs % clipMs : localMs;
  const maxT = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration - 0.05 : target / 1000;
  await seekVideo(vid, Math.max(0, Math.min(maxT, target / 1000)));
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
        draw: async (ctx, tMs) => {
          // seek the active clip to this exact moment before drawing (no-op for
          // photo slides) — frame-exact, so the exported clip is smooth
          await seekReelForFrame(doc, tMs, res);
          drawReelFrame(ctx as CanvasRenderingContext2D, doc, tMs, res);
        },
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
