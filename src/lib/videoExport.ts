// ---------------------------------------------------------------------------
// Auto-scrolling panorama video: records a smooth swipe across the whole
// canvas via canvas.captureStream + MediaRecorder. Real-time capture — a
// 10s video takes 10s to record. Experimental by nature (codec support
// varies); WebM on Chrome/Firefox, MP4 where the browser offers it.
// ---------------------------------------------------------------------------

import type { ProjectDoc } from '../types';
import { canvasSize } from './slicer';
import { loadResources, releaseResources, slug } from './exporter';
import { renderRegion } from './renderer';

export interface VideoExportOptions {
  /** scroll duration, excluding the hold at each end */
  durationSec: number;
  fps?: number;
  onProgress?: (fraction: number) => void;
}

const HOLD_SEC = 0.7; // pause on first/last panel
const MAX_STRIP_PIXELS = 12_000_000;

function pickMimeType(): string | null {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

export function videoExportSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    pickMimeType() !== null
  );
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

export async function exportPanoramaVideo(
  doc: ProjectDoc,
  opts: VideoExportOptions,
): Promise<{ name: string; blob: Blob }> {
  if (doc.mode !== 'carousel') throw new Error('Panorama video needs a carousel project');
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error('This browser cannot record canvas video');

  const fps = opts.fps ?? 30;
  const { width: W, height: H } = canvasSize(doc);
  const pw = doc.panelWidth;
  const outH = doc.panelHeight;

  const resources = await loadResources(doc);
  let strip: OffscreenCanvas;
  let stripScale: number;
  try {
    // pre-render the whole canvas once, downscaled if needed to bound memory
    stripScale = Math.min(1, Math.sqrt(MAX_STRIP_PIXELS / (W * H)));
    strip = renderRegion(doc, { x: 0, y: 0, width: W, height: H }, resources, stripScale);
  } finally {
    releaseResources(resources);
  }

  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const totalSec = opts.durationSec + 2 * HOLD_SEC;
  const travel = Math.max(0, W - pw);

  const drawAt = (x: number) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(strip, x * stripScale, 0, pw * stripScale, H * stripScale, 0, 0, pw, outH);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error('Video recording failed'));
  });

  drawAt(0);
  recorder.start(250);
  const start = performance.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed >= totalSec) {
        drawAt(travel);
        resolve();
        return;
      }
      const t = Math.min(1, Math.max(0, (elapsed - HOLD_SEC) / opts.durationSec));
      drawAt(smoothstep(t) * travel);
      opts.onProgress?.(elapsed / totalSec);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  recorder.stop();
  const blob = await done;
  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  return { name: `${slug(doc.name)}-panorama.${ext}`, blob };
}
