// ---------------------------------------------------------------------------
// Motion panel export: render each carousel panel that contains a video clip
// to a real MP4/WebM by driving the clip in real time and compositing every
// frame through renderRegion (the SAME code path as a still export, so seam
// continuity + z-order + frame styles are identical). Image-only panels stay
// still JPGs. Real-time capture — a 4s panel takes 4s to record.
// ---------------------------------------------------------------------------

import type { ProjectDoc } from '../types';
import { db } from '../db/db';
import { panelRect, rotatedBBox } from './slicer';
import { renderRegion, renderPanel } from './renderer';
import type { RenderResources } from './renderer';
import { loadResources, releaseResources, slug } from './exporter';
import { pickMimeType } from './videoExport';

export { videoExportSupported } from './videoExport';

/** clamp bounds for a single motion panel's length */
export const MIN_PANEL_SEC = 1;
export const MAX_PANEL_SEC = 10;

export interface PanelMotion {
  index: number;
  hasVideo: boolean;
  /** recording length for this panel (0 for still panels) */
  durationSec: number;
  /** ids of the video layers that live in this panel */
  videoLayerIds: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Decide, per panel, whether it needs a motion recording and how long. Pure:
 * takes a map of photoId → clip length (seconds) for the doc's VIDEO layers.
 * A video layer belongs to a panel when its bounding box overlaps that panel's
 * horizontal span (panels are full-height slices). Grid docs never animate.
 */
export function panelMotionPlan(
  doc: ProjectDoc,
  videoDurations: Map<string, number>,
  capSec = MAX_PANEL_SEC,
): PanelMotion[] {
  const plan: PanelMotion[] = [];
  for (let i = 0; i < doc.panelCount; i++) {
    if (doc.mode !== 'carousel') {
      plan.push({ index: i, hasVideo: false, durationSec: 0, videoLayerIds: [] });
      continue;
    }
    const rect = panelRect(doc.panelWidth, doc.panelHeight, i);
    const ids: string[] = [];
    let maxDur = 0;
    for (const layer of doc.layers) {
      if (layer.type !== 'photo' || !layer.photoId) continue;
      const dur = videoDurations.get(layer.photoId);
      if (dur === undefined) continue;
      const bbox = rotatedBBox(
        { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
        layer.rotation,
      );
      const overlaps = bbox.x < rect.x + rect.width && bbox.x + bbox.width > rect.x;
      if (!overlaps) continue;
      ids.push(layer.id);
      maxDur = Math.max(maxDur, dur);
    }
    plan.push({
      index: i,
      hasVideo: ids.length > 0,
      durationSec: ids.length > 0 ? clamp(maxDur, MIN_PANEL_SEC, capSec) : 0,
      videoLayerIds: ids,
    });
  }
  return plan;
}

/** clip durations (seconds) for every VIDEO photo the doc references */
async function videoDurations(doc: ProjectDoc): Promise<Map<string, number>> {
  const ids = new Set<string>();
  for (const l of doc.layers) if (l.type === 'photo' && l.photoId) ids.add(l.photoId);
  const out = new Map<string, number>();
  for (const id of ids) {
    const rec = await db.photos.get(id);
    if (rec?.kind === 'video') out.set(id, rec.duration ?? MIN_PANEL_SEC);
  }
  return out;
}

/** true when the doc has at least one video layer (gates the Motion UI) */
export async function docHasVideo(doc: ProjectDoc): Promise<boolean> {
  const durs = await videoDurations(doc);
  return durs.size > 0;
}

export interface MotionExportOptions {
  fps?: number;
  /** overall 0..1 progress across the whole bundle */
  onProgress?: (fraction: number) => void;
  capSec?: number;
}

export interface MotionFile {
  name: string;
  blob: Blob;
}

/** Record one panel of live video to a Blob using preloaded resources. */
async function recordPanel(
  doc: ProjectDoc,
  panelIndex: number,
  durationSec: number,
  resources: RenderResources,
  mimeType: string,
  fps: number,
): Promise<Blob> {
  const rect = panelRect(doc.panelWidth, doc.panelHeight, panelIndex);
  const canvas = document.createElement('canvas');
  canvas.width = doc.panelWidth;
  canvas.height = doc.panelHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // restart the clips in this panel from the top
  const videos = resources.videos ? [...resources.videos.values()] : [];
  for (const v of videos) {
    try {
      v.currentTime = 0;
      await v.play();
    } catch {
      /* muted autoplay should always succeed; ignore */
    }
  }

  const drawFrame = () => {
    const region = renderRegion(doc, rect, resources, 1);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(region, 0, 0);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error('Video recording failed'));
  });

  drawFrame();
  recorder.start(250);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      drawFrame();
      if ((performance.now() - start) / 1000 >= durationSec) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  for (const v of videos) v.pause();
  return done;
}

/**
 * Export the whole carousel as per-panel media: video panels → MP4/WebM,
 * image-only panels → still JPG. Returns files in panel order for the caller
 * to bundle (ZIP). Throws when the browser can't record canvas video.
 */
export async function exportMotionPanels(
  doc: ProjectDoc,
  opts: MotionExportOptions = {},
): Promise<MotionFile[]> {
  if (doc.mode !== 'carousel') throw new Error('Motion export needs a carousel project');
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error('This browser cannot record canvas video');
  const fps = opts.fps ?? 30;
  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

  const durs = await videoDurations(doc);
  const plan = panelMotionPlan(doc, durs, opts.capSec ?? MAX_PANEL_SEC);
  const pad = (n: number) => String(n).padStart(2, '0');

  const resources = await loadResources(doc, false, true);
  try {
    const files: MotionFile[] = [];
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      const base = `${slug(doc.name)}-${pad(p.index + 1)}`;
      if (p.hasVideo) {
        const blob = await recordPanel(doc, p.index, p.durationSec, resources, mimeType, fps);
        files.push({ name: `${base}.${ext}`, blob });
      } else {
        const canvas = renderPanel(doc, p.index, resources);
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
        files.push({ name: `${base}.jpg`, blob });
      }
      opts.onProgress?.((i + 1) / plan.length);
    }
    return files;
  } finally {
    releaseResources(resources);
  }
}
