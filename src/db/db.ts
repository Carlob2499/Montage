// ---------------------------------------------------------------------------
// Dexie (IndexedDB) schema. Everything lives on-device: original photo blobs,
// thumbnails, edit stacks, projects, stickers. No network, ever.
// ---------------------------------------------------------------------------

import Dexie from 'dexie';
import type { Table } from 'dexie';
import type {
  AlbumRecord,
  EditStack,
  PhotoRecord,
  ProjectDoc,
  StickerRecord,
} from '../types';

export interface BlobRow {
  /** photoId (originals/proxies/thumbs share the photo's id) */
  id: string;
  blob: Blob;
}

export interface EditRow {
  photoId: string;
  stack: EditStack;
}

export interface StickerRow extends StickerRecord {
  blob: Blob;
}

class MontageDB extends Dexie {
  albums!: Table<AlbumRecord, string>;
  photos!: Table<PhotoRecord, string>;
  originals!: Table<BlobRow, string>;
  proxies!: Table<BlobRow, string>;
  thumbs!: Table<BlobRow, string>;
  edits!: Table<EditRow, string>;
  projects!: Table<ProjectDoc, string>;
  stickers!: Table<StickerRow, string>;

  constructor() {
    super('montage-studio');
    this.version(1).stores({
      albums: 'id, name, createdAt',
      photos: 'id, albumId, dateTaken, dateAdded, fileName, order, *tags',
      originals: 'id',
      proxies: 'id',
      thumbs: 'id',
      edits: 'photoId',
      projects: 'id, name, updatedAt',
      stickers: 'id, dateAdded',
    });
  }
}

export const db = new MontageDB();

export function uid(): string {
  return crypto.randomUUID();
}

/** Total bytes stored, by table, for the storage-used indicator. */
export async function storageBreakdown(): Promise<{
  originals: number;
  proxies: number;
  thumbs: number;
  stickers: number;
  total: number;
}> {
  const sum = async (table: Table<BlobRow, string>) => {
    let bytes = 0;
    await table.each((row) => {
      bytes += row.blob.size;
    });
    return bytes;
  };
  const [originals, proxies, thumbs] = await Promise.all([
    sum(db.originals),
    sum(db.proxies),
    sum(db.thumbs),
  ]);
  let stickers = 0;
  await db.stickers.each((s) => {
    stickers += s.blob.size;
  });
  return {
    originals,
    proxies,
    thumbs,
    stickers,
    total: originals + proxies + thumbs + stickers,
  };
}

/** Delete photos and every associated blob/edit. */
export async function deletePhotos(photoIds: string[]): Promise<void> {
  await db.transaction(
    'rw',
    [db.photos, db.originals, db.proxies, db.thumbs, db.edits],
    async () => {
      await db.photos.bulkDelete(photoIds);
      await db.originals.bulkDelete(photoIds);
      await db.proxies.bulkDelete(photoIds);
      await db.thumbs.bulkDelete(photoIds);
      await db.edits.bulkDelete(photoIds);
    },
  );
}

/** Delete an album and all photos inside it. */
export async function deleteAlbum(albumId: string): Promise<void> {
  const photos = await db.photos.where('albumId').equals(albumId).primaryKeys();
  await deletePhotos(photos as string[]);
  await db.albums.delete(albumId);
}

/** Merge album `fromId` into `intoId` (photos move, source album removed). */
export async function mergeAlbums(fromId: string, intoId: string): Promise<void> {
  await db.transaction('rw', [db.photos, db.albums], async () => {
    await db.photos.where('albumId').equals(fromId).modify({ albumId: intoId });
    await db.albums.delete(fromId);
  });
}
