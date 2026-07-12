import { useEffect, useState } from 'react';
import { db } from '../db/db';

type BlobTable = 'thumbs' | 'proxies' | 'originals' | 'stickers';

// Session-scoped object-URL cache so grids don't re-create URLs on re-render.
const cache = new Map<string, string>();

export async function getBlobUrl(table: BlobTable, id: string): Promise<string | null> {
  const key = `${table}:${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const row = await db[table].get(id);
  if (!row) return null;
  const url = URL.createObjectURL(row.blob);
  cache.set(key, url);
  return url;
}

export function invalidateBlobUrl(table: BlobTable, id: string): void {
  const key = `${table}:${id}`;
  const url = cache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    cache.delete(key);
  }
}

export function useBlobUrl(table: BlobTable, id: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    id ? (cache.get(`${table}:${id}`) ?? null) : null,
  );
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    void getBlobUrl(table, id).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [table, id]);
  return url;
}

/** Load an HTMLImageElement from a cached blob URL (for Konva). */
export function useBlobImage(
  table: BlobTable,
  id: string | null | undefined,
): HTMLImageElement | null {
  const url = useBlobUrl(table, id);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    let alive = true;
    const el = new Image();
    el.onload = () => {
      if (alive) setImg(el);
    };
    el.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return img;
}

/**
 * Load a muted, looping HTMLVideoElement from a cached blob URL, resolving only
 * once it can actually render a frame. Uses the iOS-safe combination
 * (muted + playsInline + preload='auto') — Safari never reaches
 * HAVE_CURRENT_DATA with preload='metadata'. `enabled=false` skips loading so
 * the caller can fall back to the poster still.
 */
export function useBlobVideo(
  table: BlobTable,
  id: string | null | undefined,
  enabled = true,
): HTMLVideoElement | null {
  const url = useBlobUrl(table, enabled ? id : null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!url || !enabled) {
      setVideo(null);
      return;
    }
    let alive = true;
    const el = document.createElement('video');
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    const onReady = () => {
      if (alive) setVideo(el);
    };
    el.onloadeddata = onReady;
    el.src = url;
    el.load();
    return () => {
      alive = false;
      el.onloadeddata = null;
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }, [url, enabled]);
  return video;
}
