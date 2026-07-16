// ---------------------------------------------------------------------------
// DB-touching scoring helpers shared by the background scan hook and the
// on-demand Auto Montage flow. Reads the 320px thumbnail, runs the pure
// analyzers, and persists the result on the PhotoRecord.
// ---------------------------------------------------------------------------

import { db } from '../../db/db';
import type { PhotoRecord, PhotoScores } from '../../types';
import { analyzePhoto, pixelsFromBlob } from './analyze';

/** neutral sentinel for photos we couldn't analyze (no thumb / decode failure) */
export const NEUTRAL_SCORES: PhotoScores = {
  quality: 0.5,
  sharpness: 0.5,
  exposure: 0.5,
  colorfulness: 0,
  phash: '',
  palette: [],
  vibe: 'muted',
  hue: 0,
  sat: 0,
  light: 0.5,
};

/** Compute scores for one record from its thumbnail; never throws. */
export async function scoreOne(record: PhotoRecord): Promise<PhotoScores> {
  try {
    const row = await db.thumbs.get(record.id);
    if (!row) return NEUTRAL_SCORES;
    const px = await pixelsFromBlob(row.blob);
    return analyzePhoto(px, record.faces ?? []);
  } catch {
    return NEUTRAL_SCORES;
  }
}

/**
 * Score any records still missing `scores`, persisting each and returning a
 * fully-scored copy of the input list (unscored entries replaced with scored
 * clones). `onProgress(done, total)` fires per newly-scored photo.
 */
export async function scoreMissing(
  records: PhotoRecord[],
  onProgress?: (done: number, total: number) => void,
): Promise<PhotoRecord[]> {
  const missing = records.filter((r) => r.scores === undefined);
  const scored = new Map<string, PhotoScores>();
  let done = 0;
  for (const r of missing) {
    const s = await scoreOne(r);
    scored.set(r.id, s);
    await db.photos.update(r.id, { scores: s });
    onProgress?.(++done, missing.length);
  }
  return records.map((r) => (scored.has(r.id) ? { ...r, scores: scored.get(r.id)! } : r));
}
