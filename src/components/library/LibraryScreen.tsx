import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteAlbum, deletePhotos, mergeAlbums, storageBreakdown, uid } from '../../db/db';
import { importFiles } from '../../db/importPhotos';
import { useUIStore } from '../../state/uiStore';
import { promptText, confirmAction } from '../../state/dialogStore';
import { useProjectStore } from '../../state/projectStore';
import { sortPhotos, searchPhotos, filterPhotos, availableMonths } from '../../lib/photoSort';
import { formatBytes } from '../../lib/imageUtils';
import { useBlobUrl } from '../../hooks/useBlobUrl';
import { useCurationScan } from '../../hooks/useCurationScan';
import { scoreMissing } from '../../lib/curation/score';
import { curateAlbum } from '../../lib/curation/select';
import { buildAutoMontageDoc } from '../../lib/curation/autoMontage';
import type { AlbumRecord, PhotoRecord, SortMode, VibeLabel } from '../../types';
import { addPhotoLayersToProject, applyAutoLayout } from '../editor/canvasActions';
import PhotoEditSheet from '../editor/PhotoEditSheet';
import TripMap from './TripMap';

export default function LibraryScreen() {
  const go = useUIStore((s) => s.go);
  const toast = useUIStore((s) => s.toast);
  const activeAlbumId = useUIStore((s) => s.activeAlbumId);
  const setAlbum = useUIStore((s) => s.setAlbum);
  const pickerTarget = useUIStore((s) => s.pickerTarget);
  const hasProject = useProjectStore((s) => s.doc !== null);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [editPhotoId, setEditPhotoId] = useState<string | null>(null);
  const [showStorage, setShowStorage] = useState(false);
  const [montagePrep, setMontagePrep] = useState<{
    album: AlbumRecord;
    picks: PhotoRecord[];
    vibe: VibeLabel;
  } | null>(null);
  const [montageProgress, setMontageProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [filterFav, setFilterFav] = useState(false);
  const [filterLocated, setFilterLocated] = useState(false);
  const [filterMonth, setFilterMonth] = useState('');
  const [showMap, setShowMap] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const albums = useLiveQuery(() => db.albums.orderBy('createdAt').toArray(), []);
  // most recent imports across all albums — shown while picking for the canvas
  const recents = useLiveQuery(
    () => (pickerTarget ? db.photos.orderBy('dateAdded').reverse().limit(12).toArray() : []),
    [pickerTarget],
  );
  const album = albums?.find((a) => a.id === activeAlbumId) ?? null;
  const photos = useLiveQuery(
    async () => (activeAlbumId ? db.photos.where('albumId').equals(activeAlbumId).toArray() : []),
    [activeAlbumId],
  );

  const months = photos ? availableMonths(photos) : [];
  const shown = photos
    ? searchPhotos(
        filterPhotos(sortPhotos(photos, album?.sortMode ?? 'dateTaken'), {
          favorite: filterFav || undefined,
          located: filterLocated || undefined,
          month: filterMonth || undefined,
        }),
        query,
      )
    : [];

  // background-score the open album's photos for curation (quality/vibe/phash)
  useCurationScan((photos ?? []).filter((p) => p.scores === undefined).map((p) => p.id));

  const createAlbum = async () => {
    const name = await promptText({
      title: 'New album',
      message: 'One per trip or event works well.',
      placeholder: 'Album name',
      confirmLabel: 'Create',
    });
    if (!name?.trim()) return;
    try {
      const id = uid();
      await db.albums.add({ id, name: name.trim(), createdAt: Date.now(), sortMode: 'dateTaken' });
      setAlbum(id);
    } catch (err) {
      console.error(err);
      toast('Could not create album — storage may be full or unavailable', 'error');
    }
  };

  // curate an album into a themed montage draft (scores → curate → pre-flight)
  const startAutoMontage = async (albumId: string) => {
    const alb = await db.albums.get(albumId);
    const pics = await db.photos.where('albumId').equals(albumId).toArray();
    if (!alb || pics.length < 3) {
      toast('Add at least 3 photos to auto-create a montage', 'error');
      return;
    }
    setMontageProgress({ done: 0, total: pics.filter((p) => p.scores === undefined).length });
    try {
      const scored = await scoreMissing(pics, (done, total) =>
        setMontageProgress({ done, total }),
      );
      const { picks, vibe } = curateAlbum(scored);
      setMontagePrep({ album: alb, picks, vibe });
    } catch (err) {
      console.error(err);
      toast('Could not analyze this album', 'error');
    } finally {
      setMontageProgress(null);
    }
  };

  const createMontage = async (vibe: VibeLabel) => {
    if (!montagePrep) return;
    const doc = buildAutoMontageDoc(montagePrep.album, montagePrep.picks, vibe, uid);
    await db.projects.put(doc);
    useProjectStore.getState().loadProject(doc);
    setMontagePrep(null);
    toast('Montage created — tweak and export ✨', 'success');
    go('editor');
  };

  const onFiles = async (files: File[]) => {
    setBusy(true);
    setImportProgress({ done: 0, total: files.length });
    try {
      let albumId = activeAlbumId;
      if (!albumId) {
        // auto-create a default album inside the try so a failed DB write
        // surfaces a toast instead of silently no-op'ing the whole import
        const id = uid();
        await db.albums.add({ id, name: 'My photos', createdAt: Date.now(), sortMode: 'dateTaken' });
        setAlbum(id);
        albumId = id;
      }
      const result = await importFiles(files, albumId, (done, total) =>
        setImportProgress({ done, total }),
      );
      if (result.imported.length) {
        toast(`Imported ${result.imported.length} of ${files.length} file(s)`, 'success');
      }
      if (result.errors.length) {
        // summarize instead of a toast per file — 30 vanishing toasts read as "nothing happened"
        const first = result.errors[0];
        toast(
          `${result.errors.length} file(s) failed — e.g. ${first.fileName}: ${first.message}`,
          'error',
        );
      }
      if (!result.imported.length && !result.errors.length) {
        toast('No files received from the picker — try selecting them again', 'error');
      }
    } catch (err) {
      // batch-level failures must NEVER be silent
      console.error(err);
      toast(err instanceof Error ? `Import failed: ${err.message}` : 'Import failed', 'error');
    } finally {
      setBusy(false);
      setImportProgress(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const photoTapped = (photo: PhotoRecord) => {
    if (selecting) return toggleSelect(photo.id);
    if (pickerTarget && hasProject) {
      addPhotoLayersToProject([photo], pickerTarget);
      useUIStore.getState().setPickerTarget(null);
      go('editor');
      return;
    }
    setEditPhotoId(photo.id);
  };

  const addSelectedToCanvas = () => {
    const picked = shown.filter((p) => selected.has(p.id));
    if (!picked.length) return;
    addPhotoLayersToProject(picked, { kind: 'layer' });
    setSelecting(false);
    setSelected(new Set());
    go('editor');
  };

  const autoLayoutSelected = () => {
    const picked = shown.filter((p) => selected.has(p.id) && p.kind === 'image');
    if (!picked.length) return;
    applyAutoLayout(picked, 'dump');
    setSelecting(false);
    setSelected(new Set());
    toast('Photo dump laid out — shuffle it from Layouts ✨', 'success');
    go('editor');
  };

  const batchDelete = async () => {
    if (!selected.size) return;
    const ok = await confirmAction({
      title: `Delete ${selected.size} photo(s)?`,
      message: 'This permanently removes them from this device.',
      destructive: true,
    });
    if (!ok) return;
    await deletePhotos([...selected]);
    setSelected(new Set());
    setSelecting(false);
  };

  const batchMove = async () => {
    if (!albums || !selected.size) return;
    const others = albums.filter((a) => a.id !== activeAlbumId);
    if (!others.length) return toast('Create another album first', 'error');
    const name = await promptText({
      title: 'Move to album',
      message: `Type the album name:\n${others.map((a) => `· ${a.name}`).join('\n')}`,
      placeholder: 'Album name',
      confirmLabel: 'Move',
    });
    const target = others.find((a) => a.name.toLowerCase() === name?.trim().toLowerCase());
    if (!target) return;
    await db.photos.where('id').anyOf([...selected]).modify({ albumId: target.id });
    setSelected(new Set());
    setSelecting(false);
    toast(`Moved to ${target.name}`, 'success');
  };

  const batchFavorite = async () => {
    if (!selected.size) return;
    const ids = [...selected];
    // if all selected are already favorited, toggle them off; else favorite all
    const rows = await db.photos.where('id').anyOf(ids).toArray();
    const allFav = rows.every((p) => p.favorite);
    await db.photos
      .where('id')
      .anyOf(ids)
      .modify({ favorite: !allFav });
    setSelecting(false);
    setSelected(new Set());
  };

  const batchTag = async () => {
    if (!selected.size) return;
    const tag = await promptText({
      title: 'Add tag',
      placeholder: 'e.g. beach, 2026, family',
      confirmLabel: 'Add',
    });
    if (!tag?.trim()) return;
    const clean = tag.trim().toLowerCase();
    await db.photos
      .where('id')
      .anyOf([...selected])
      .modify((p) => {
        if (!p.tags.includes(clean)) p.tags.push(clean);
      });
    toast(`Tagged #${clean}`, 'success');
  };

  const dupeCount = photos?.filter((p) => p.duplicateOf).length ?? 0;

  return (
    <div
      className="flex h-full flex-col pt-[max(env(safe-area-inset-top),0.5rem)]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length) void onFiles(files);
      }}
    >
      <header className="flex items-center gap-2 px-4 py-2">
        <button className="btn-ghost px-2" onClick={() => go(hasProject && pickerTarget ? 'editor' : 'home')}>
          ←
        </button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
          {pickerTarget ? 'Pick a photo' : (album?.name ?? 'Library')}
        </h2>
        <button className="btn-ghost px-2.5 text-xs" onClick={() => setShowStorage(true)}>
          Storage
        </button>
        <button
          className={`btn-ghost px-2.5 text-xs ${selecting ? 'text-accent-500' : ''}`}
          onClick={() => {
            setSelecting(!selecting);
            setSelected(new Set());
          }}
        >
          {selecting ? 'Done' : 'Select'}
        </button>
      </header>

      {/* recents strip while picking for the canvas */}
      {pickerTarget && recents && recents.length > 0 && (
        <div className="px-4 pb-1">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Recent imports
          </div>
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
            {recents.map((p) => (
              <RecentThumb key={p.id} photo={p} onTap={() => photoTapped(p)} />
            ))}
          </div>
        </div>
      )}

      {/* album strip */}
      <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-2">
        <button className="btn-soft shrink-0 rounded-full px-3 py-1.5 text-xs" onClick={() => void createAlbum()}>
          + Album
        </button>
        {albums?.map((a) => (
          <button
            key={a.id}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              a.id === activeAlbumId
                ? 'bg-accent-500 text-white'
                : 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200'
            }`}
            onClick={() => setAlbum(a.id)}
            onDoubleClick={() =>
              void (async () => {
                const name = await promptText({
                  title: 'Rename album',
                  defaultValue: a.name,
                  confirmLabel: 'Rename',
                });
                if (name?.trim()) void db.albums.update(a.id, { name: name.trim() });
              })()
            }
          >
            {a.name}
          </button>
        ))}
      </div>

      {album && (
        <div className="flex items-center gap-2 px-4 pb-2">
          <input
            className="input-base flex-1 py-2 text-xs"
            placeholder="Search tags & file names…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="input-base w-auto py-2 text-xs"
            value={album.sortMode}
            onChange={(e) => void db.albums.update(album.id, { sortMode: e.target.value as SortMode })}
          >
            <option value="best">✨ Best shots</option>
            <option value="dateTaken">Date taken</option>
            <option value="fileName">File name</option>
            <option value="dateAdded">Date added</option>
            <option value="manual">Manual</option>
          </select>
          <AlbumMenu
            albumId={album.id}
            albums={albums ?? []}
            onAutoMontage={startAutoMontage}
          />
        </div>
      )}

      {album && (photos?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
          <FilterChip active={filterFav} onClick={() => setFilterFav((v) => !v)}>
            ♥ Favorites
          </FilterChip>
          <FilterChip active={filterLocated} onClick={() => setFilterLocated((v) => !v)}>
            📍 Located
          </FilterChip>
          {months.length > 1 && (
            <select
              className={`input-base w-auto py-1 text-xs ${filterMonth ? 'ring-1 ring-accent-500' : ''}`}
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              <option value="">All months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          )}
          {(filterFav || filterLocated || filterMonth) && (
            <button
              className="text-xs text-ink-400 underline"
              onClick={() => {
                setFilterFav(false);
                setFilterLocated(false);
                setFilterMonth('');
              }}
            >
              Clear
            </button>
          )}
          {(photos?.some((p) => p.gps) ?? false) && (
            <button
              className="rounded-lg bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300"
              onClick={() => setShowMap(true)}
            >
              📍 Map
            </button>
          )}
          <span className="ml-auto text-xs text-ink-400">{shown.length} shown</span>
        </div>
      )}

      {dupeCount > 0 && (
        <div className="mx-4 mb-2 flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <span>{dupeCount} possible duplicate(s) flagged</span>
          <button
            className="font-semibold underline"
            onClick={async () => {
              const ids = photos!.filter((p) => p.duplicateOf).map((p) => p.id);
              const ok = await confirmAction({
                title: `Delete ${ids.length} duplicate(s)?`,
                message: 'The earliest copy of each is kept.',
                destructive: true,
              });
              if (ok) {
                await deletePhotos(ids);
                toast('Duplicates removed', 'success');
              }
            }}
          >
            Clean up
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28">
        {!album && (
          <div className="surface mt-8 rounded-2xl p-8 text-center text-sm text-ink-400">
            Create an album, then drop photos here or use the import button below.
            <br />
            JPEG · PNG · WebP · HEIC · short MP4/WebM
          </div>
        )}
        {album && shown.length === 0 && !busy && (
          <div className="mt-8 text-center text-sm text-ink-400">
            No photos here yet — import some below.
          </div>
        )}
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
          {shown.map((p) => (
            <PhotoThumb
              key={p.id}
              photo={p}
              selected={selected.has(p.id)}
              selecting={selecting}
              onTap={() => photoTapped(p)}
              onLongPress={() => {
                setSelecting(true);
                toggleSelect(p.id);
              }}
            />
          ))}
        </div>
      </div>

      {/* bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-ink-700 dark:bg-ink-900/90 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {selecting ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <div className="flex-1" />
            {hasProject && (
              <>
                <button
                  className="btn-primary"
                  disabled={!selected.size}
                  onClick={autoLayoutSelected}
                  title="One-tap photo dump layout"
                >
                  ✨ Dump
                </button>
                <button className="btn-soft" disabled={!selected.size} onClick={addSelectedToCanvas}>
                  Add
                </button>
              </>
            )}
            <button className="btn-soft" disabled={!selected.size} onClick={() => void batchFavorite()}>
              ♥ Favorite
            </button>
            <button className="btn-soft" disabled={!selected.size} onClick={() => void batchTag()}>
              Tag
            </button>
            <button className="btn-soft" disabled={!selected.size} onClick={() => void batchMove()}>
              Move
            </button>
            <button className="btn-soft text-red-500" disabled={!selected.size} onClick={() => void batchDelete()}>
              Delete
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy && importProgress
                ? `Importing ${importProgress.done}/${importProgress.total}…`
                : busy
                  ? 'Importing…'
                  : '+ Import photos & videos'}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              // wildcard accept: anything narrower makes iOS gray out videos
              // (it records .mov/QuickTime) and some album photos in the picker
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                // materialize before clearing — FileList is live and empties on reset
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (files.length) void onFiles(files);
              }}
            />
          </div>
        )}
      </div>

      {editPhotoId && (
        <PhotoEditSheet key={editPhotoId} photoId={editPhotoId} onClose={() => setEditPhotoId(null)} />
      )}
      {showStorage && <StorageSheet onClose={() => setShowStorage(false)} />}
      {showMap && <TripMap photos={photos ?? []} onClose={() => setShowMap(false)} />}
      {montageProgress && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="surface rounded-2xl px-6 py-5 text-center">
            <div className="text-2xl">✨</div>
            <div className="mt-1 text-sm font-semibold">Analyzing your album…</div>
            <div className="mt-1 text-xs text-ink-400">
              {montageProgress.total > 0
                ? `Scoring ${montageProgress.done}/${montageProgress.total}`
                : 'Curating the best shots'}
            </div>
          </div>
        </div>
      )}
      {montagePrep && (
        <AutoMontageSheet
          prep={montagePrep}
          onCancel={() => setMontagePrep(null)}
          onCreate={createMontage}
        />
      )}
    </div>
  );
}

const VIBE_LABELS: Record<VibeLabel, string> = {
  sunwashed: 'Sunwashed',
  moody: 'Moody',
  vibrant: 'Vibrant',
  muted: 'Muted',
  mono: 'Mono',
};

function AutoMontageSheet({
  prep,
  onCancel,
  onCreate,
}: {
  prep: { album: AlbumRecord; picks: PhotoRecord[]; vibe: VibeLabel };
  onCancel: () => void;
  onCreate: (vibe: VibeLabel) => void;
}) {
  const [vibe, setVibe] = useState<VibeLabel>(prep.vibe);
  const vibes: VibeLabel[] = ['sunwashed', 'moody', 'vibrant', 'muted', 'mono'];
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onCancel} />
      <div className="sheet z-40 md:inset-auto md:left-1/2 md:top-1/2 md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border">
        <div className="space-y-4 p-5">
          <div>
            <h3 className="text-lg font-semibold">✨ Auto Montage</h3>
            <p className="text-sm text-ink-400">
              Picked <b>{prep.picks.length}</b> best shots from “{prep.album.name}”, spread across
              your trip. Choose a vibe:
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {vibes.map((v) => (
              <button
                key={v}
                onClick={() => setVibe(v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  vibe === v
                    ? 'bg-accent-500 text-white'
                    : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
                }`}
              >
                {VIBE_LABELS[v]}
                {v === prep.vibe ? ' ·detected' : ''}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button className="btn-soft flex-1" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn-primary flex-1" onClick={() => onCreate(vibe)}>
              Create montage
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function AlbumMenu({
  albumId,
  albums,
  onAutoMontage,
}: {
  albumId: string;
  albums: { id: string; name: string }[];
  onAutoMontage: (albumId: string) => void;
}) {
  const toast = useUIStore((s) => s.toast);
  const setAlbum = useUIStore((s) => s.setAlbum);
  const go = useUIStore((s) => s.go);
  return (
    <select
      className="input-base w-auto py-2 text-xs"
      value=""
      onChange={async (e) => {
        const action = e.target.value;
        e.target.value = '';
        if (action === 'montage') {
          onAutoMontage(albumId);
        } else if (action === 'recap') {
          const album = await db.albums.get(albumId);
          const photos = (await db.photos.where('albumId').equals(albumId).toArray()).filter(
            (p) => p.kind === 'image',
          );
          if (!album || photos.length < 2) {
            return toast('Need at least 2 photos for a recap', 'error');
          }
          const { buildRecapDoc } = await import('../../lib/recap');
          const doc = buildRecapDoc(album, photos, uid);
          await db.projects.put(doc);
          useProjectStore.getState().loadProject(doc);
          toast('Recap generated — tweak and export ✨', 'success');
          go('editor');
        } else if (action === 'rename') {
          const name = await promptText({ title: 'Rename album', confirmLabel: 'Rename' });
          if (name?.trim()) await db.albums.update(albumId, { name: name.trim() });
        } else if (action === 'merge') {
          const others = albums.filter((a) => a.id !== albumId);
          if (!others.length) return toast('No other album to merge into', 'error');
          const name = await promptText({
            title: 'Merge album into',
            message: `Type the target album name:\n${others.map((a) => `· ${a.name}`).join('\n')}`,
            placeholder: 'Album name',
            confirmLabel: 'Merge',
          });
          const target = others.find((a) => a.name.toLowerCase() === name?.trim().toLowerCase());
          if (target) {
            await mergeAlbums(albumId, target.id);
            setAlbum(target.id);
            toast('Albums merged', 'success');
          }
        } else if (action === 'delete') {
          const ok = await confirmAction({
            title: 'Delete album?',
            message: 'This deletes the album AND all photos inside it.',
            destructive: true,
          });
          if (ok) {
            await deleteAlbum(albumId);
            setAlbum(null);
          }
        }
      }}
    >
      <option value="">⋯</option>
      <option value="montage">✨ Auto Montage (AI curate)</option>
      <option value="recap">✨ Generate recap</option>
      <option value="rename">Rename</option>
      <option value="merge">Merge into…</option>
      <option value="delete">Delete album</option>
    </select>
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return `${MONTH_NAMES[Number(mo) - 1] ?? mo} ${y}`;
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
        active
          ? 'bg-accent-500 text-white'
          : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
      }`}
    >
      {children}
    </button>
  );
}

function PhotoThumb({
  photo,
  selected,
  selecting,
  onTap,
  onLongPress,
}: {
  photo: PhotoRecord;
  selected: boolean;
  selecting: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const url = useBlobUrl('thumbs', photo.id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <button
      className={`relative aspect-square overflow-hidden rounded-lg bg-ink-100 dark:bg-ink-800 ${
        selected ? 'ring-3 ring-accent-500' : ''
      }`}
      onClick={onTap}
      onPointerDown={() => {
        timer.current = setTimeout(onLongPress, 450);
      }}
      onPointerUp={() => timer.current && clearTimeout(timer.current)}
      onPointerLeave={() => timer.current && clearTimeout(timer.current)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {url && (
        <img
          src={url}
          alt={photo.fileName}
          className={`h-full w-full object-cover ${
            photo.scores && photo.scores.quality < 0.3 ? 'opacity-50' : ''
          }`}
          draggable={false}
        />
      )}
      {photo.scores && photo.scores.quality >= 0.7 && (
        <span
          className="absolute left-1 top-1 rounded bg-amber-400/90 px-1 text-[10px] text-black"
          title="Top pick"
        >
          ★
        </span>
      )}
      {photo.kind === 'video' && (
        <span className="absolute left-1 top-6 rounded bg-black/60 px-1 text-[10px] text-white">▶ video</span>
      )}
      {photo.duplicateOf && (
        <span className="absolute right-1 top-1 rounded bg-amber-500/90 px-1 text-[10px] text-white">dupe</span>
      )}
      {!selecting && (
        <span
          role="button"
          aria-label={photo.favorite ? 'Unfavorite' : 'Favorite'}
          title={photo.favorite ? 'Unfavorite' : 'Favorite'}
          className={`absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full text-sm ${
            photo.favorite ? 'text-rose-400' : 'text-white/70'
          }`}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void db.photos.update(photo.id, { favorite: !photo.favorite });
          }}
        >
          {photo.favorite ? '♥' : '♡'}
        </span>
      )}
      {photo.tags.length > 0 && (
        <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded bg-black/50 px-1 text-[10px] text-white">
          #{photo.tags.join(' #')}
        </span>
      )}
      {selecting && (
        <span
          className={`absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
            selected ? 'bg-accent-500 text-white' : 'bg-white/80 text-transparent'
          }`}
        >
          ✓
        </span>
      )}
    </button>
  );
}

function RecentThumb({ photo, onTap }: { photo: PhotoRecord; onTap: () => void }) {
  const url = useBlobUrl('thumbs', photo.id);
  return (
    <button
      className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-100 dark:bg-ink-800"
      onClick={onTap}
    >
      {url && <img src={url} alt={photo.fileName} className="h-full w-full object-cover" />}
    </button>
  );
}

function StorageSheet({ onClose }: { onClose: () => void }) {
  const breakdown = useLiveQuery(() => storageBreakdown(), []);
  const toast = useUIStore((s) => s.toast);
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />
      <div className="sheet z-40 p-5">
        <h3 className="mb-3 text-lg font-semibold">Storage used</h3>
        {breakdown ? (
          <div className="space-y-1.5 text-sm">
            <Row label="Original photos" value={formatBytes(breakdown.originals)} />
            <Row label="Editing proxies" value={formatBytes(breakdown.proxies)} />
            <Row label="Thumbnails" value={formatBytes(breakdown.thumbs)} />
            <Row label="Stickers" value={formatBytes(breakdown.stickers)} />
            <div className="border-t border-ink-200 pt-1.5 dark:border-ink-700">
              <Row label={<b>Total</b>} value={<b>{formatBytes(breakdown.total)}</b>} />
            </div>
          </div>
        ) : (
          <div className="text-sm text-ink-400">Calculating…</div>
        )}
        <div className="mt-4 flex gap-2">
          <button className="btn-soft flex-1" onClick={onClose}>
            Close
          </button>
          <button
            className="btn-soft flex-1 text-red-500"
            onClick={async () => {
              const ok = await confirmAction({
                title: 'Erase all data?',
                message: 'Deletes ALL albums, photos, projects and stickers on this device. This cannot be undone.',
                confirmLabel: 'Erase everything',
                destructive: true,
              });
              if (ok) {
                // close the open project FIRST — otherwise autosave writes it
                // right back into the freshly-cleared projects table
                useProjectStore.getState().closeProject();
                useUIStore.getState().setAlbum(null);
                await Promise.all([
                  db.albums.clear(),
                  db.photos.clear(),
                  db.originals.clear(),
                  db.proxies.clear(),
                  db.thumbs.clear(),
                  db.edits.clear(),
                  db.projects.clear(),
                  db.stickers.clear(),
                ]);
                toast('All data cleared', 'success');
                onClose();
              }
            }}
          >
            Erase all data
          </button>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}
