import { useEffect } from 'react';
import { db, uid } from '../db/db';
import { importFiles } from '../db/importPhotos';
import { useUIStore } from '../state/uiStore';

const INBOX_CACHE = 'share-target-inbox';
const INBOX_ALBUM = 'Shared to Montage';

/**
 * Drain the share-target inbox (files shared from the OS share sheet, stashed
 * by the service worker) into the library. Runs on launch and whenever the
 * app regains visibility — a share can happen while the PWA stays alive in
 * the background.
 */
export function useShareInbox(): void {
  useEffect(() => {
    let running = false;
    const drain = async () => {
      if (running || !('caches' in window)) return;
      running = true;
      try {
        const cache = await caches.open(INBOX_CACHE);
        const keys = await cache.keys();
        if (keys.length === 0) return;

        const files: File[] = [];
        for (const req of keys) {
          const res = await cache.match(req);
          if (!res) continue;
          const blob = await res.blob();
          const name = decodeURIComponent(res.headers.get('x-file-name') ?? 'shared.jpg');
          files.push(new File([blob], name, { type: blob.type }));
        }

        let album = (await db.albums.toArray()).find((a) => a.name === INBOX_ALBUM);
        if (!album) {
          album = { id: uid(), name: INBOX_ALBUM, createdAt: Date.now(), sortMode: 'dateAdded' as const };
          await db.albums.add(album);
        }
        const result = await importFiles(files, album.id);
        // only clear what we processed — a share arriving mid-drain survives
        for (const req of keys) await cache.delete(req);
        if (result.imported.length) {
          useUIStore
            .getState()
            .toast(`${result.imported.length} shared photo(s) added to "${INBOX_ALBUM}"`, 'success');
        }
        for (const err of result.errors) {
          useUIStore.getState().toast(`${err.fileName}: ${err.message}`, 'error');
        }
      } catch {
        // inbox drain must never break app startup
      } finally {
        running = false;
      }
    };

    void drain();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void drain();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}
