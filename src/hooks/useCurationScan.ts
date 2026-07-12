import { useEffect } from 'react';
import { db } from '../db/db';
import { scoreOne } from '../lib/curation/score';

/**
 * Opportunistically score the given photos for curation (quality, phash,
 * palette/vibe) off their 320px thumbnails. Mirrors useFaceScan: sequential,
 * scan-once (guarded by `scores === undefined`), cached on the PhotoRecord,
 * and yields between photos so a big album never janks the main thread.
 */
export function useCurationScan(photoIds: string[]): void {
  const key = photoIds.join(',');

  useEffect(() => {
    if (photoIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const id of photoIds) {
        if (cancelled) return;
        const record = await db.photos.get(id);
        if (!record || record.scores !== undefined) continue;
        const scores = await scoreOne(record);
        if (!cancelled) await db.photos.update(id, { scores });
        // let the UI breathe between photos
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
