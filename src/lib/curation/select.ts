// ---------------------------------------------------------------------------
// Album curation (pure): turn a raw album into an ordered best-of set for a
// montage. Visual-dedups (phash), drops low-quality shots, matches a vibe, and
// spreads the picks across time & place so the montage isn't 8 near-identical
// frames from one afternoon. Deterministic (stable id tie-breaks).
// ---------------------------------------------------------------------------

import type { PhotoRecord, PhotoScores, VibeLabel } from '../../types';
import { hammingDistance } from './phash';
import { haversineKm } from '../recap';

export interface CurationOptions {
  /** how many photos to select (caller derives from the target panel count) */
  targetCount?: number;
  /** force a vibe instead of auto-detecting the album's dominant one */
  vibe?: VibeLabel;
  /** phash hamming distance at/below which two photos are "the same shot" */
  dedupThreshold?: number;
  /** quality below this is dropped (unless we'd fall short of targetCount) */
  qualityFloor?: number;
  /** optional external relevance per photoId (0..1) — e.g. CLIP vibe match */
  relevance?: Map<string, number>;
}

export type RejectReason = 'duplicate' | 'low-quality' | 'not-selected';

export interface CurationResult {
  picks: PhotoRecord[];
  vibe: VibeLabel;
  rejected: { id: string; reason: RejectReason }[];
}

const NEUTRAL: PhotoScores = {
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

const scoresOf = (p: PhotoRecord): PhotoScores => p.scores ?? NEUTRAL;
const timeOf = (p: PhotoRecord): number => p.dateTaken ?? p.dateAdded;

const DAY_MS = 86_400_000;

/** similarity 0..1 between two photos across time, place and appearance */
function similarity(a: PhotoRecord, b: PhotoRecord, thr: number): number {
  const dt = Math.abs(timeOf(a) - timeOf(b));
  const timeSim = Math.max(0, 1 - dt / DAY_MS); // same day → high
  let gpsSim = 0;
  if (a.gps && b.gps) gpsSim = Math.max(0, 1 - haversineKm(a.gps, b.gps) / 5); // 5km falloff
  const pa = scoresOf(a).phash;
  const pb = scoresOf(b).phash;
  const lookSim = pa && pb ? Math.max(0, 1 - hammingDistance(pa, pb) / (thr * 2)) : 0;
  return Math.max(timeSim * 0.6 + gpsSim * 0.4, lookSim);
}

/** Greedy phash clustering; returns the best-quality representative per cluster
 *  plus the ids dropped as duplicates. */
function dedupe(
  photos: PhotoRecord[],
  threshold: number,
): { reps: PhotoRecord[]; dupes: string[] } {
  const reps: PhotoRecord[] = [];
  const dupes: string[] = [];
  for (const p of photos) {
    const hash = scoresOf(p).phash;
    let merged = false;
    if (hash) {
      for (let i = 0; i < reps.length; i++) {
        const rHash = scoresOf(reps[i]).phash;
        if (rHash && hammingDistance(hash, rHash) <= threshold) {
          // keep the higher-quality of the pair as the representative
          if (scoresOf(p).quality > scoresOf(reps[i]).quality) {
            dupes.push(reps[i].id);
            reps[i] = p;
          } else {
            dupes.push(p.id);
          }
          merged = true;
          break;
        }
      }
    }
    if (!merged) reps.push(p);
  }
  return { reps, dupes };
}

/** most common vibe among reps, weighted by quality */
function dominantVibe(reps: PhotoRecord[]): VibeLabel {
  const tally = new Map<VibeLabel, number>();
  for (const p of reps) {
    const s = scoresOf(p);
    tally.set(s.vibe, (tally.get(s.vibe) ?? 0) + s.quality);
  }
  let best: VibeLabel = 'muted';
  let bestW = -1;
  for (const [vibe, w] of tally) {
    if (w > bestW) {
      bestW = w;
      best = vibe;
    }
  }
  return best;
}

export function curateAlbum(photos: PhotoRecord[], opts: CurationOptions = {}): CurationResult {
  const dedupThreshold = opts.dedupThreshold ?? 8;
  const qualityFloor = opts.qualityFloor ?? 0.3;
  const rejected: { id: string; reason: RejectReason }[] = [];

  // stable order so results are deterministic
  const sorted = [...photos].sort((a, b) => timeOf(a) - timeOf(b) || (a.id < b.id ? -1 : 1));

  const { reps, dupes } = dedupe(sorted, dedupThreshold);
  for (const id of dupes) rejected.push({ id, reason: 'duplicate' });

  // How many to pick. A curated best-of reads better than the whole roll, but
  // the default must be GENEROUS and scale with the album — clamping a big dump
  // makes the app feel like it silently ate most of your photos. So: keep ~80%
  // of the de-duplicated shots, floor 6, cap 40 by default (dedup + the quality
  // floor already removed the genuine junk). Callers (and the Preview "photos"
  // control) can override targetCount to go all the way to every unique shot.
  const DEFAULT_MAX_PICKS = 40;
  const requested = opts.targetCount ?? Math.min(DEFAULT_MAX_PICKS, Math.round(reps.length * 0.8));
  // an explicit targetCount is honored up to the available pool; the default is
  // floored at 6 so tiny albums still make a montage
  const targetCount = Math.min(
    reps.length,
    Math.max(opts.targetCount != null ? 1 : 6, requested),
  );
  const vibe = opts.vibe ?? dominantVibe(reps);

  // quality floor, but never starve the target
  const aboveFloor = reps.filter((p) => scoresOf(p).quality >= qualityFloor);
  const pool = aboveFloor.length >= targetCount ? aboveFloor : reps;
  for (const p of reps) {
    if (!pool.includes(p)) rejected.push({ id: p.id, reason: 'low-quality' });
  }

  // relevance = quality × vibe match (× optional external relevance)
  const relevanceOf = (p: PhotoRecord): number => {
    const s = scoresOf(p);
    const match = s.vibe === vibe ? 1 : 0.75;
    const ext = opts.relevance?.get(p.id) ?? 1;
    return s.quality * match * ext;
  };

  // greedy MMR: maximize relevance while penalizing similarity to picks so far
  const LAMBDA = 0.5;
  const remaining = [...pool];
  const picks: PhotoRecord[] = [];
  while (picks.length < targetCount && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      let maxSim = 0;
      for (const chosen of picks) maxSim = Math.max(maxSim, similarity(cand, chosen, dedupThreshold));
      const score = relevanceOf(cand) - LAMBDA * maxSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    picks.push(remaining.splice(bestIdx, 1)[0]);
  }
  for (const p of remaining) rejected.push({ id: p.id, reason: 'not-selected' });

  // chronological order for the montage
  picks.sort((a, b) => timeOf(a) - timeOf(b) || (a.id < b.id ? -1 : 1));
  return { picks, vibe, rejected };
}
