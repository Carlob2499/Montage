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
  SnapshotRecord,
  StickerRecord,
  StyleRecord,
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
  styles!: Table<StyleRecord, string>;
  snapshots!: Table<SnapshotRecord, string>;

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
    // v2: saved style collections
    this.version(2).stores({
      styles: 'id, name, createdAt',
    });
    // v3: durable project revision snapshots. `favorite` is an unindexed
    // field on photos (booleans aren't valid IndexedDB keys, and favorites are
    // filtered from the already-loaded album array) — so no photos re-declare.
    this.version(3).stores({
      snapshots: 'id, projectId, createdAt',
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
      // clear duplicate flags that pointed at a just-deleted photo, so the
      // "clean up duplicates" action can never delete a last-remaining copy
      const deleted = new Set(photoIds);
      await db.photos
        .filter((p) => p.duplicateOf !== undefined && deleted.has(p.duplicateOf))
        .modify({ duplicateOf: undefined });
    },
  );
}

/** Delete an album and all photos inside it — atomically, so photos imported
 * concurrently can't be orphaned between the read and the deletes. */
export async function deleteAlbum(albumId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.albums, db.photos, db.originals, db.proxies, db.thumbs, db.edits],
    async () => {
      const photoIds = (await db.photos
        .where('albumId')
        .equals(albumId)
        .primaryKeys()) as string[];
      await db.photos.bulkDelete(photoIds);
      await db.originals.bulkDelete(photoIds);
      await db.proxies.bulkDelete(photoIds);
      await db.thumbs.bulkDelete(photoIds);
      await db.edits.bulkDelete(photoIds);
      const deleted = new Set(photoIds);
      await db.photos
        .filter((p) => p.duplicateOf !== undefined && deleted.has(p.duplicateOf))
        .modify({ duplicateOf: undefined });
      await db.albums.delete(albumId);
    },
  );
}

/** Merge album `fromId` into `intoId` (photos move, source album removed). */
export async function mergeAlbums(fromId: string, intoId: string): Promise<void> {
  await db.transaction('rw', [db.photos, db.albums], async () => {
    await db.photos.where('albumId').equals(fromId).modify({ albumId: intoId });
    await db.albums.delete(fromId);
  });
}

// --- Project revision snapshots ---------------------------------------------

/** Write a durable snapshot of a project doc, then prune to the newest `max`. */
export async function snapshotProject(
  doc: ProjectDoc,
  label?: string,
  max = 15,
): Promise<void> {
  const snap: SnapshotRecord = {
    id: uid(),
    projectId: doc.id,
    createdAt: Date.now(),
    label,
    // structuredClone so later in-memory edits can't mutate the stored copy
    doc: structuredClone(doc),
  };
  await db.snapshots.add(snap);
  await pruneSnapshots(doc.id, max);
}

/** All snapshots for a project, newest first. */
export function listSnapshots(projectId: string): Promise<SnapshotRecord[]> {
  return db.snapshots
    .where('projectId')
    .equals(projectId)
    .sortBy('createdAt')
    .then((rows) => rows.reverse());
}

/** Keep only the newest `max` snapshots for a project. */
export async function pruneSnapshots(projectId: string, max: number): Promise<void> {
  const ids = await db.snapshots.where('projectId').equals(projectId).sortBy('createdAt');
  const excess = ids.length - max;
  if (excess > 0) {
    await db.snapshots.bulkDelete(ids.slice(0, excess).map((s) => s.id));
  }
}

/** Remove all snapshots for a deleted project. */
export async function deleteProjectSnapshots(projectId: string): Promise<void> {
  const ids = (await db.snapshots
    .where('projectId')
    .equals(projectId)
    .primaryKeys()) as string[];
  await db.snapshots.bulkDelete(ids);
}
