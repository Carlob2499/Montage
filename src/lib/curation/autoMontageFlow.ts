// ---------------------------------------------------------------------------
// One-tap Auto Montage: take a raw photo dump (Files) and produce a finished,
// curated, stitched montage ProjectDoc — import → score → curate → build — with
// staged progress. The result lands in Preview; no manual editing required.
// ---------------------------------------------------------------------------

import { db, uid } from '../../db/db';
import { importFiles } from '../../db/importPhotos';
import type { AlbumRecord, PhotoRecord, ProjectDoc, VibeLabel } from '../../types';
import { scoreMissing } from './score';
import { curateAlbum } from './select';
import { storyOrder } from './storyOrder';
import { buildAutoMontageDoc } from './autoMontage';

export type MontageStage = 'importing' | 'scoring' | 'stitching';
export interface MontageProgress {
  stage: MontageStage;
  done: number;
  total: number;
}

export interface MontageResult {
  doc: ProjectDoc;
  album: AlbumRecord;
  picks: PhotoRecord[];
  vibe: VibeLabel;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function defaultAlbumName(): string {
  const d = new Date();
  return `Montage · ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Turn a dump of image/video files into a curated montage. Creates a new album,
 * imports everything, scores + curates the best shots, and stitches them into a
 * themed carousel. Returns the built (and persisted) doc plus the recipe needed
 * to reshuffle it later.
 */
export async function createMontageFromFiles(
  files: File[],
  onProgress?: (p: MontageProgress) => void,
): Promise<MontageResult> {
  const album: AlbumRecord = {
    id: uid(),
    name: defaultAlbumName(),
    createdAt: Date.now(),
    sortMode: 'dateTaken',
  };
  await db.albums.add(album);

  const { imported } = await importFiles(files, album.id, (done, total) =>
    onProgress?.({ stage: 'importing', done, total }),
  );
  if (imported.length === 0) {
    // nothing usable — clean up the empty album so it doesn't linger
    await db.albums.delete(album.id);
    throw new Error('None of those files could be imported');
  }

  const scored = await scoreMissing(imported, (done, total) =>
    onProgress?.({ stage: 'scoring', done, total }),
  );

  onProgress?.({ stage: 'stitching', done: 0, total: 1 });
  const { picks, vibe } = curateAlbum(scored);
  // reorder the best-of into a narrated arc (establishing → middle → finale)
  const chosen = storyOrder(picks.length ? picks : scored);
  const doc = buildAutoMontageDoc(album, chosen, vibe, uid);
  await db.projects.put(doc);
  onProgress?.({ stage: 'stitching', done: 1, total: 1 });

  return { doc, album, picks: chosen, vibe };
}
