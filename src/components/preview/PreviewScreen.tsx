import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useUIStore } from '../../state/uiStore';
import { loadResources, releaseResources } from '../../lib/exporter';
import { renderGridTile, renderPanel } from '../../lib/renderer';

/**
 * Swipe simulation: pages through the sliced panels exactly as Instagram
 * would render them — scroll-snapped, with the panel counter chip.
 */
export default function PreviewScreen() {
  const doc = useProjectStore((s) => s.doc);
  const go = useUIStore((s) => s.go);
  const [urls, setUrls] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!doc) return;
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
          // crisper preview: 0.92 (was 0.85) — gradients/skin no longer smear
          const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
          // re-check AFTER the await: unmount cleanup already revoked made[],
          // so a URL created now would leak for the page lifetime
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
  }, [doc]);

  const total = doc ? (doc.mode === 'grid' ? doc.panelCount * 3 : doc.panelCount) : 0;

  // hands-free autoplay: advance one panel every 1.6s, looping back to start
  useEffect(() => {
    if (!playing || !doc || doc.mode !== 'carousel' || total <= 1) return;
    const id = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const next = Math.round(el.scrollLeft / w) + 1;
      const target = next >= total ? 0 : next;
      el.scrollTo({ left: target * w, behavior: 'smooth' });
    }, 1600);
    return () => clearInterval(id);
  }, [playing, doc, total]);

  if (!doc) return null;

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <header className="flex items-center gap-2 px-3 py-2 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <button className="btn-ghost px-2 text-white" onClick={() => go('editor')}>
          ←
        </button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-amber-400 to-fuchsia-500" />
          <div>
            <div className="text-sm font-semibold leading-tight">you</div>
            <div className="text-[11px] leading-tight text-white/50">swipe preview</div>
          </div>
        </div>
        <div className="flex-1" />
        {doc.mode === 'carousel' && total > 1 && (
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-sm"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
        )}
        {doc.mode === 'carousel' && (
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
            {Math.min(current + 1, total)}/{total}
          </span>
        )}
      </header>

      {doc.mode === 'carousel' ? (
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
      <div className="pb-[max(env(safe-area-inset-bottom),0.5rem)]" />
    </div>
  );
}
