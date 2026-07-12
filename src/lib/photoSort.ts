// ---------------------------------------------------------------------------
// Album sorting, tag search, and duplicate detection. Pure — unit tested.
// ---------------------------------------------------------------------------

import type { PhotoRecord, SortMode } from '../types';
import { hammingDistance } from './curation/phash';

/**
 * Sort photos for display. EXIF date-taken is the default; photos without
 * EXIF fall back to their import date so they still land sensibly in the
 * timeline. All sorts are stable with id as the final tiebreak.
 */
export function sortPhotos(photos: PhotoRecord[], mode: SortMode): PhotoRecord[] {
  const arr = [...photos];
  const byId = (a: PhotoRecord, b: PhotoRecord) => a.id.localeCompare(b.id);
  switch (mode) {
    case 'dateTaken':
      return arr.sort((a, b) => {
        const ta = a.dateTaken ?? a.dateAdded;
        const tb = b.dateTaken ?? b.dateAdded;
        return ta - tb || byId(a, b);
      });
    case 'fileName':
      return arr.sort(
        (a, b) =>
          a.fileName.localeCompare(b.fileName, undefined, {
            numeric: true,
            sensitivity: 'base',
          }) || byId(a, b),
      );
    case 'dateAdded':
      return arr.sort((a, b) => a.dateAdded - b.dateAdded || byId(a, b));
    case 'manual':
      return arr.sort((a, b) => a.order - b.order || byId(a, b));
    case 'best':
      // highest curation quality first; unscored photos sink to the bottom
      return arr.sort((a, b) => {
        const qa = a.scores?.quality ?? -1;
        const qb = b.scores?.quality ?? -1;
        return qb - qa || byId(a, b);
      });
  }
}

export interface PhotoFilter {
  /** only favorited photos */
  favorite?: boolean;
  /** only photos with GPS coordinates */
  located?: boolean;
  /** YYYY-MM bucket (from dateTaken, falling back to dateAdded) */
  month?: string;
}

/** the YYYY-MM month a photo belongs to (EXIF date, else import date) */
export function photoMonth(p: PhotoRecord): string {
  const d = new Date(p.dateTaken ?? p.dateAdded);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** distinct YYYY-MM buckets present in the set, newest first */
export function availableMonths(photos: PhotoRecord[]): string[] {
  return [...new Set(photos.map(photoMonth))].sort().reverse();
}

/** Apply favorites / located / month filters (all optional, ANDed). */
export function filterPhotos(photos: PhotoRecord[], filter: PhotoFilter): PhotoRecord[] {
  return photos.filter((p) => {
    if (filter.favorite && !p.favorite) return false;
    if (filter.located && !p.gps) return false;
    if (filter.month && photoMonth(p) !== filter.month) return false;
    return true;
  });
}

/** Case-insensitive search across tags and file names. */
export function searchPhotos(photos: PhotoRecord[], query: string): PhotoRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return photos;
  const terms = q.split(/\s+/);
  return photos.filter((p) => {
    const hay = [p.fileName.toLowerCase(), ...p.tags.map((t) => t.toLowerCase())];
    return terms.every((term) => hay.some((h) => h.includes(term)));
  });
}

/**
 * Basic duplicate detection: identical pixel dimensions + byte size +
 * capture time. Photos without EXIF capture time are never flagged — two
 * different no-EXIF files (screenshots, scans) can easily collide on
 * dimensions + size alone. Returns a map of duplicate photo id → the id of
 * the photo it duplicates (the earliest-added copy wins).
 */
export function findDuplicates(photos: PhotoRecord[]): Map<string, string> {
  const groups = new Map<string, PhotoRecord[]>();
  for (const p of photos) {
    if (p.dateTaken === undefined) continue;
    const key = `${p.width}x${p.height}:${p.byteSize}:${p.dateTaken}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const dupes = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.dateAdded - b.dateAdded);
    const original = sorted[0];
    for (let i = 1; i < sorted.length; i++) dupes.set(sorted[i].id, original.id);
  }

  // Perceptual tier: catch visual dupes the metadata tier misses (no-EXIF
  // re-saves, resized/re-encoded copies). Cluster scored photos by phash
  // hamming distance; the earliest-added copy is the original.
  const scored = photos.filter((p) => p.scores?.phash && !dupes.has(p.id));
  const reps: PhotoRecord[] = [];
  for (const p of scored) {
    const hash = p.scores!.phash;
    let matched = false;
    for (const rep of reps) {
      if (hammingDistance(hash, rep.scores!.phash) <= PHASH_DUPE_THRESHOLD) {
        const [orig, dup] = p.dateAdded <= rep.dateAdded ? [p, rep] : [rep, p];
        dupes.set(dup.id, orig.id);
        matched = true;
        break;
      }
    }
    if (!matched) reps.push(p);
  }
  return dupes;
}

/** phash hamming distance treated as "the same shot" for dedup */
const PHASH_DUPE_THRESHOLD = 6;
