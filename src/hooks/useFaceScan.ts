import { useEffect } from 'react';
import { db } from '../db/db';
import { useProjectStore } from '../state/projectStore';

interface DetectedFace {
  boundingBox: { x: number; y: number; width: number; height: number };
}
interface FaceDetectorLike {
  detect(image: ImageBitmapSource): Promise<DetectedFace[]>;
}
declare global {
  interface Window {
    FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike;
  }
}

export function faceDetectionSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.FaceDetector === 'function';
}

/**
 * Lazily scan photos used by the open project for faces (Shape Detection
 * API, where the browser ships it). Results are cached on the PhotoRecord;
 * faces: [] marks "scanned, none found" so photos are only scanned once.
 */
export function useFaceScan(): void {
  const doc = useProjectStore((s) => s.doc);
  const photoIds = doc
    ? [...new Set(doc.layers.flatMap((l) => (l.type === 'photo' && l.photoId ? [l.photoId] : [])))]
    : [];
  const key = photoIds.join(',');

  useEffect(() => {
    if (!faceDetectionSupported() || photoIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      const detector = new window.FaceDetector!({ fastMode: true, maxDetectedFaces: 8 });
      for (const id of photoIds) {
        if (cancelled) return;
        const record = await db.photos.get(id);
        if (!record || record.faces !== undefined || record.kind !== 'image') continue;
        try {
          const row = await db.proxies.get(id);
          if (!row) continue;
          const bmp = await createImageBitmap(row.blob);
          const found = await detector.detect(bmp);
          const faces = found.map((f) => ({
            x: f.boundingBox.x / bmp.width,
            y: f.boundingBox.y / bmp.height,
            width: f.boundingBox.width / bmp.width,
            height: f.boundingBox.height / bmp.height,
          }));
          bmp.close();
          await db.photos.update(id, { faces });
        } catch {
          await db.photos.update(id, { faces: [] }); // don't retry forever
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
