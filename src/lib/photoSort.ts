// ---------------------------------------------------------------------------
// Album sorting, tag search, and duplicate detection. Pure — unit tested.
// ---------------------------------------------------------------------------

import type { PhotoRecord, SortMode } from '../types';

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
  }
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
  return dupes;
}
