// ---------------------------------------------------------------------------
// Orchestrates the pure metrics into a PhotoScores bag, plus a small helper to
// pull a Pixels bag off a stored thumbnail blob (the cheap 320px analysis
// path — never touches originals).
// ---------------------------------------------------------------------------

import type { PhotoScores } from '../../types';
import type { Pixels } from './pixels';
import { qualityScore } from './quality';
import { pHash } from './phash';
import { analyzePalette } from './palette';
import { computeFocal } from './focal';
import type { FaceBox } from './focal';
import { makeCanvas } from '../imageUtils';

/** Pure: fold every metric into a PhotoScores. `faces` are normalized boxes. */
export function analyzePhoto(px: Pixels, faces: FaceBox[] = []): PhotoScores {
  const q = qualityScore(px, faces.length);
  const pal = analyzePalette(px);
  return {
    quality: q.quality,
    sharpness: q.sharpness,
    exposure: q.exposure,
    colorfulness: q.colorfulness,
    phash: pHash(px),
    palette: pal.palette,
    vibe: pal.vibe,
    hue: pal.hue,
    sat: pal.sat,
    light: pal.light,
    focal: computeFocal(px, faces),
  };
}

/** Decode a stored thumbnail blob into a Pixels bag (downscaled, cheap). */
export async function pixelsFromBlob(blob: Blob, maxEdge = 160): Promise<Pixels> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const { ctx } = makeCanvas(w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  return { data: img.data, width: img.width, height: img.height };
}
