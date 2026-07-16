import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useUIStore } from '../../state/uiStore';
import { useMontageStore } from '../../state/montageStore';
import { bundleZip, downloadBlob, exportPanels, loadResources, releaseResources, slug } from '../../lib/exporter';
import { renderGridTile, renderPanel } from '../../lib/renderer';
import { buildAutoMontageDoc, VIBE_CYCLE } from '../../lib/curation/autoMontage';
import { buildReelDoc, REEL_DURATIONS, DEFAULT_REEL_DURATION } from '../../lib/reel/buildReel';
import { exportReelVideo, reelExportSupported } from '../../lib/reel/reelExport';
import ReelPlayer from './ReelPlayer';
import { db, uid } from '../../db/db';
import Icon from '../shared/Icon';

type Format = 'reel' | 'carousel';

/**
 * Preview: for an Auto Montage this defaults to the animated 9:16 Reel (the
 * flagship output); a toggle drops to the seamless carousel. Non-montage
 * projects keep the classic swipe/grid preview.
 */
export default function PreviewScreen() {
  const doc = useProjectStore((s) => s.doc);
  const go = useUIStore((s) => s.go);
  const toast = useUIStore((s) => s.toast);
  const recipe = useMontageStore((s) => s.recipe);
  const isMontage = !!recipe && !!doc && recipe.docId === doc.id;
  const canReel = isMontage && reelExportSupported();

  const [format, setFormat] = useState<Format>('reel');
  const [reelSec, setReelSec] = useState<number>(DEFAULT_REEL_DURATION);
  const showReel = canReel && format === 'reel';

  const [urls, setUrls] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reelProgress, setReelProgress] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // the reel is derived from the SAME recipe as the carousel; it re-derives on
  // shuffle (recipe.shuffles) and duration change. Memoized so the player isn't
  // handed a fresh doc every render (which would reload its bitmaps).
  const reelDoc = useMemo(() => {
    if (!recipe) return null;
    const seed = (recipe.album.id.length * 2654435761 + recipe.shuffles * 2246822519 + 1) >>> 0;
    return buildReelDoc(recipe.album, recipe.picks, recipe.vibe, uid, {
      seed,
      durationSec: reelSec,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.docId, recipe?.vibe, recipe?.shuffles, reelSec]);

  // regenerate the montage from the same best-shot picks with a fresh
  // arrangement + theme — varies both the carousel and the reel
  const shuffle = () => {
    if (!recipe) return;
    const n = recipe.shuffles + 1;
    const vibe = VIBE_CYCLE[n % VIBE_CYCLE.length];
    const seed = (recipe.album.id.length * 2654435761 + n * 40503) >>> 0;
    const next = buildAutoMontageDoc(recipe.album, recipe.picks, vibe, uid, { seed });
    void db.projects.put(next);
    useProjectStore.getState().loadProject(next);
    useMontageStore.getState().setRecipe({ ...recipe, docId: next.id, vibe, shuffles: n });
  };

  const exportReel = async () => {
    if (!reelDoc) return;
    setExporting(true);
    setReelProgress(0);
    try {
      const { name, blob } = await exportReelVideo(reelDoc, {
        onProgress: (f) => setReelProgress(f),
      });
      downloadBlob(blob, name);
      toast('Reel saved ✓', 'success');
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : 'Reel export failed', 'error');
    } finally {
      setExporting(false);
      setReelProgress(null);
    }
  };

  const exportCarousel = async () => {
    if (!doc) return;
    setExporting(true);
    try {
      const files = await exportPanels(doc, { format: 'image/jpeg', quality: 0.92 });
      const zip = await bundleZip(doc, files);
      downloadBlob(zip, `${slug(doc.name)}.zip`);
      toast(`Saved ${files.length} panels ✓`, 'success');
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  // carousel panel thumbnails — skipped while the reel is on screen
  useEffect(() => {
    if (!doc || showReel) return;
    let cancelled = false;
    const made: string[] = [];
    (async () => {
      const resources = await loadResources(doc, true);
      try {
        const count = doc.mode === 'grid' ? doc.panelCount * 3 : doc.panelCount;
        for (let i = 0; i < count; i++) {
          if (cancelled) break;
          const canvas =
            doc.mode === 'grid'
              ? renderGridTile(doc, Math.floor(i / 3), i % 3, resources)
              : renderPanel(doc, i, resources);
          const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
          if (cancelled) break;
          made.push(URL.createObjectURL(blob));
          setUrls([...made]);
        }
      } finally {
        releaseResources(resources);
      }
    })();
    return () => {
      cancelled = true;
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, [doc, showReel]);

  const total = doc ? (doc.mode === 'grid' ? doc.panelCount * 3 : doc.panelCount) : 0;

  // hands-free autoplay for the carousel view
  useEffect(() => {
    if (showReel || !playing || !doc || doc.mode !== 'carousel' || total <= 1) return;
    const id = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const next = Math.round(el.scrollLeft / w) + 1;
      const target = next >= total ? 0 : next;
      el.scrollTo({ left: target * w, behavior: 'smooth' });
    }, 1600);
    return () => clearInterval(id);
  }, [playing, doc, total, showReel]);

  if (!doc) return null;

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <header className="flex items-center gap-2 px-3 py-2 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <button
          className="icon-btn text-white hover:bg-white/10"
          aria-label="Back"
          onClick={() => go(isMontage ? 'home' : 'editor')}
        >
          <Icon name="chevron-left" />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-amber-400 to-fuchsia-500" />
          <div>
            <div className="text-sm font-semibold leading-tight">you</div>
            <div className="text-[11px] leading-tight text-white/50">
              {isMontage ? 'your auto montage' : 'swipe preview'}
            </div>
          </div>
        </div>
        <div className="flex-1" />
        {/* Reel | Carousel format toggle (montage only) */}
        {canReel && (
          <div className="flex rounded-full bg-white/10 p-0.5 text-xs font-semibold">
            {(['reel', 'carousel'] as Format[]).map((f) => (
              <button
                key={f}
                className={`rounded-full px-3 py-1 capitalize transition-colors ${
                  format === f ? 'bg-white text-black' : 'text-white/70'
                }`}
                onClick={() => setFormat(f)}
              >
                {f}
              </button>
            ))}
          </div>
        )}
        {!showReel && doc.mode === 'carousel' && total > 1 && (
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-sm"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
        )}
        {!showReel && doc.mode === 'carousel' && (
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
            {Math.min(current + 1, total)}/{total}
          </span>
        )}
      </header>

      {showReel && reelDoc ? (
        <ReelPlayer doc={reelDoc} />
      ) : doc.mode === 'carousel' ? (
        <>
          <div
            ref={scrollRef}
            className="scrollbar-none flex min-h-0 flex-1 snap-x snap-mandatory items-center overflow-x-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              const w = el.clientWidth;
              if (w > 0) setCurrent(Math.round(el.scrollLeft / w));
            }}
          >
            {Array.from({ length: total }, (_, i) => (
              <div key={i} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
                {urls[i] ? (
                  <img src={urls[i]} alt={`Panel ${i + 1}`} className="max-h-full w-full object-contain" />
                ) : (
                  <div className="h-[70%] w-[86%] animate-pulse rounded-xl bg-gradient-to-br from-white/10 to-white/5" />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5 py-3">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`rounded-full transition-all ${
                  i === current ? 'h-2 w-2 bg-sky-400' : 'h-1.5 w-1.5 bg-white/30'
                }`}
              />
            ))}
          </div>
          {doc.captions[current] && (
            <p className="line-clamp-2 px-4 pb-3 text-sm text-white/80">
              <b>you</b> {doc.captions[current]}
            </p>
          )}
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          <p className="px-2 py-2 text-xs text-white/50">
            Profile-grid preview — how the 3×{doc.panelCount} composite reads on your profile.
          </p>
          <div className="grid grid-cols-3 gap-0.5">
            {Array.from({ length: total }, (_, i) => (
              <div key={i} className="aspect-square bg-white/5">
                {urls[i] && <img src={urls[i]} alt="" className="h-full w-full object-cover" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {isMontage && (
        <div className="border-t border-white/10 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {/* duration chips (reel only) */}
          {showReel && (
            <div className="mb-3 flex items-center justify-center gap-2">
              {REEL_DURATIONS.map((s) => (
                <button
                  key={s}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    reelSec === s ? 'bg-white text-black' : 'bg-white/10 text-white/70'
                  }`}
                  onClick={() => setReelSec(s)}
                  disabled={exporting}
                >
                  {s}s
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/15 py-3 text-sm font-semibold text-white active:scale-[0.97] disabled:opacity-50"
              onClick={shuffle}
              disabled={exporting}
            >
              <Icon name="wand" size={18} /> Shuffle
            </button>
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/15 py-3 text-sm font-semibold text-white active:scale-[0.97] disabled:opacity-50"
              onClick={() => go('editor')}
              disabled={exporting}
            >
              <Icon name="sliders" size={18} /> Edit
            </button>
            <button
              className="flex flex-[1.3] items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white active:scale-[0.97] disabled:opacity-70"
              style={{ backgroundImage: 'linear-gradient(120deg, #7c5cff, #f472b6)' }}
              disabled={exporting}
              onClick={() => void (showReel ? exportReel() : exportCarousel())}
            >
              <Icon name="download" size={18} />
              {exporting
                ? reelProgress !== null
                  ? `${Math.round(reelProgress * 100)}%`
                  : 'Saving…'
                : showReel
                  ? 'Export reel'
                  : 'Export'}
            </button>
          </div>
        </div>
      )}
      {!isMontage && <div className="pb-[max(env(safe-area-inset-bottom),0.5rem)]" />}
    </div>
  );
}
