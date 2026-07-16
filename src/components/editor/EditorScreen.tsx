import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useUIStore } from '../../state/uiStore';
import { useAutosave } from '../../hooks/useAutosave';
import CanvasStage from './CanvasStage';
import TextSheet from './sheets/TextSheet';
import BackgroundSheet from './sheets/BackgroundSheet';
import TemplatesSheet from './sheets/TemplatesSheet';
import PanelsSheet from './sheets/PanelsSheet';
import LayersSheet from './sheets/LayersSheet';
import CaptionsSheet from './sheets/CaptionsSheet';
import StickersSheet from './sheets/StickersSheet';
import ExportSheet from './sheets/ExportSheet';
import HistorySheet from './sheets/HistorySheet';
import PhotoEditSheet from './PhotoEditSheet';
import { addTextLayer } from './canvasActions';
import Icon from '../shared/Icon';
import type { IconName } from '../shared/Icon';
import { layerBBox } from '../../lib/renderer';
import { faceCanvasRect, suggestNudge, SEAM_MARGIN } from '../../lib/seamAssist';
import { useFaceScan, faceDetectionSupported } from '../../hooks/useFaceScan';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Rect } from '../../lib/slicer';
import type { PhotoRecord } from '../../types';

export default function EditorScreen() {
  const doc = useProjectStore((s) => s.doc);
  const selectedIds = useProjectStore((s) => s.selectedIds);
  const dirty = useProjectStore((s) => s.dirty);
  const sheet = useUIStore((s) => s.sheet);
  const go = useUIStore((s) => s.go);
  const openSheet = useUIStore((s) => s.openSheet);
  const closeSheet = useUIStore((s) => s.closeSheet);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });

  useAutosave();
  useKeyboardShortcuts();
  useFaceScan();

  const motion = useUIStore((s) => s.motion);
  const photoIdsKey = doc
    ? doc.layers
        .filter((l) => l.type === 'photo' && l.photoId)
        .map((l) => (l as { photoId: string }).photoId)
        .join(',')
    : '';
  const hasVideo = useLiveQuery(async () => {
    const ids = photoIdsKey ? photoIdsKey.split(',') : [];
    if (!ids.length) return false;
    const rows = await db.photos.bulkGet(ids);
    return rows.some((r) => r?.kind === 'video');
  }, [photoIdsKey]) ?? false;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewport({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!doc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-400">
        <p>No project open.</p>
        <button className="btn-primary" onClick={() => go('home')}>
          Back to projects
        </button>
      </div>
    );
  }

  const selectedPhotoLayer = doc.layers.find(
    (l) => selectedIds.includes(l.id) && l.type === 'photo' && l.photoId,
  );

  return (
    <div className="flex h-full flex-col">
      {/* top bar */}
      <header className="z-10 flex items-center gap-0.5 border-b border-ink-200 bg-white/85 px-2 py-2 backdrop-blur-xl dark:border-ink-700 dark:bg-ink-900/85 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <button
          className="icon-btn"
          aria-label="Back to projects"
          onClick={async () => {
            await useProjectStore.getState().save();
            go('home');
          }}
        >
          <Icon name="chevron-left" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <div className="truncate text-sm font-semibold leading-tight">{doc.name}</div>
          <div className="flex items-center gap-1.5 overflow-hidden text-[11px] leading-tight text-ink-400">
            <span
              className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dirty ? 'bg-amber-400' : 'bg-emerald-400'}`}
              title={dirty ? 'Unsaved changes' : 'Saved'}
            />
            <span className="truncate">
              {doc.mode === 'grid' ? `3×${doc.panelCount} grid` : `${doc.panelCount} panels · ${doc.aspect}`}
            </span>
          </div>
        </div>
        <button
          className="icon-btn"
          title="Version history"
          aria-label="Version history"
          onClick={() => openSheet('history')}
        >
          <Icon name="clock" />
        </button>
        {hasVideo && (
          <button
            className="icon-btn"
            title={motion ? 'Pause clips' : 'Play clips'}
            aria-label={motion ? 'Pause clips' : 'Play clips'}
            onClick={() => useUIStore.getState().toggleMotion()}
          >
            <Icon name={motion ? 'pause' : 'play'} filled={!motion} />
          </button>
        )}
        <button className="icon-btn" aria-label="Preview" title="Preview" onClick={() => go('preview')}>
          <Icon name="eye" />
        </button>
        <button className="btn-primary px-4" onClick={() => openSheet('export')}>
          <Icon name="share" size={18} />
          Export
        </button>
      </header>

      {/* seam safety warning */}
      <SeamSafetyBanner />

      {/* canvas */}
      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden bg-ink-100 dark:bg-ink-950">
        <CanvasStage viewport={viewport} />
        {selectedIds.length === 0 ? <UndoRedo /> : <SelectionBar />}
      </div>

      {/* bottom toolbar */}
      <nav className="z-10 flex items-stretch justify-around border-t border-ink-200 bg-white/95 backdrop-blur-xl dark:border-ink-700 dark:bg-ink-900/95 pb-[max(env(safe-area-inset-bottom),0.25rem)]">
        <ToolButton icon="image" label="Photos" onClick={() => {
          useUIStore.getState().setPickerTarget({ kind: 'layer' });
          go('library');
        }} />
        <ToolButton icon="text" label="Text" onClick={() => { addTextLayer(); openSheet('text'); }} />
        <ToolButton icon="layout" label="Layouts" onClick={() => openSheet('templates')} />
        <ToolButton icon="palette" label="Backdrop" onClick={() => openSheet('background')} />
        <ToolButton icon="panels" label="Panels" onClick={() => openSheet('panels')} />
        <ToolButton icon="layers" label="Layers" onClick={() => openSheet('layers')} />
      </nav>

      {/* sheets */}
      {sheet === 'text' && <TextSheet onClose={closeSheet} />}
      {sheet === 'background' && <BackgroundSheet onClose={closeSheet} />}
      {sheet === 'templates' && <TemplatesSheet onClose={closeSheet} />}
      {sheet === 'panels' && <PanelsSheet onClose={closeSheet} />}
      {sheet === 'layers' && <LayersSheet onClose={closeSheet} />}
      {sheet === 'captions' && <CaptionsSheet onClose={closeSheet} />}
      {sheet === 'stickers' && <StickersSheet onClose={closeSheet} />}
      {sheet === 'export' && <ExportSheet onClose={closeSheet} />}
      {sheet === 'history' && <HistorySheet onClose={closeSheet} />}
      {sheet === 'photoEdit' && selectedPhotoLayer?.type === 'photo' && (
        <PhotoEditSheet
          key={selectedPhotoLayer.photoId}
          photoId={selectedPhotoLayer.photoId}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}

function unionRects(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}

/**
 * Seam-safety: text layers, flagged subjects, and detected faces sitting on
 * a slice line, with a one-tap minimal nudge to clear them all.
 */
function SeamSafetyBanner() {
  const doc = useProjectStore((s) => s.doc);
  const photoIds = doc
    ? [...new Set(doc.layers.flatMap((l) => (l.type === 'photo' && l.photoId ? [l.photoId] : [])))]
    : [];
  const records = useLiveQuery(async () => {
    const rows = await db.photos.bulkGet(photoIds);
    return new Map(
      rows.filter((r): r is PhotoRecord => r !== undefined).map((r) => [r.id, r]),
    );
  }, [photoIds.join(',')]);

  if (!doc || doc.mode !== 'carousel') return null;

  // collect the "must not cross a seam" rect(s) per layer
  const warned: { layerId: string; bbox: Rect; kind: string }[] = [];
  for (const layer of doc.layers) {
    if (layer.type === 'text') {
      const bbox = layerBBox(layer);
      if (suggestNudge(bbox, doc.panelCount, doc.panelWidth) !== 0) {
        warned.push({ layerId: layer.id, bbox, kind: 'text' });
      }
      continue;
    }
    if (layer.type !== 'photo') continue;
    const rects: Rect[] = [];
    if (layer.isSubject) rects.push(layerBBox(layer));
    const record = records?.get(layer.photoId);
    if (record?.faces?.length && layer.rotation === 0) {
      for (const f of record.faces) {
        const r = faceCanvasRect(f, record.width, record.height, layer);
        if (r) rects.push(r);
      }
    }
    if (!rects.length) continue;
    const bbox = unionRects(rects);
    if (suggestNudge(bbox, doc.panelCount, doc.panelWidth) !== 0) {
      warned.push({ layerId: layer.id, bbox, kind: layer.isSubject ? 'subject' : 'face' });
    }
  }

  if (warned.length === 0) return null;

  const fixable = warned.filter((w) => {
    const dx = suggestNudge(w.bbox, doc.panelCount, doc.panelWidth);
    return dx !== null && dx !== 0;
  });

  const fixAll = () => {
    const moves = new Map<string, number>();
    for (const w of fixable) {
      const dx = suggestNudge(w.bbox, doc.panelCount, doc.panelWidth, SEAM_MARGIN);
      if (dx) moves.set(w.layerId, dx);
    }
    if (!moves.size) return;
    useProjectStore.getState().commit((d) => ({
      ...d,
      layers: d.layers.map((l) => (moves.has(l.id) ? { ...l, x: l.x + moves.get(l.id)! } : l)),
    }));
  };

  const faceNote = faceDetectionSupported() ? '' : ' (face detection unavailable here)';
  return (
    <div className="z-10 flex items-center justify-center gap-2 bg-red-500/10 px-4 py-1 text-xs font-medium text-red-600 dark:text-red-400">
      <span>
        ⚠ {warned.length} seam warning(s): {[...new Set(warned.map((w) => w.kind))].join('/')} on a
        slice line{faceNote}
      </span>
      {fixable.length > 0 && (
        <button className="rounded-lg bg-red-500 px-2 py-0.5 font-semibold text-white" onClick={fixAll}>
          Nudge {fixable.length} clear
        </button>
      )}
    </div>
  );
}

function UndoRedo() {
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  if (!canUndo && !canRedo) return null;
  return (
    <div className="absolute bottom-3 left-3 flex overflow-hidden rounded-2xl border border-ink-200/70 bg-white/85 backdrop-blur-md dark:border-ink-700/70 dark:bg-ink-900/85" style={{ boxShadow: 'var(--shadow-soft)' }}>
      <button
        className="grid h-11 w-11 place-items-center text-ink-600 disabled:opacity-30 active:bg-ink-100 dark:text-ink-300 dark:active:bg-ink-800"
        disabled={!canUndo}
        onClick={() => useProjectStore.getState().undo()}
        title="Undo (⌘Z)"
        aria-label="Undo"
      >
        <Icon name="undo" />
      </button>
      <div className="my-2 w-px bg-ink-200 dark:bg-ink-700" />
      <button
        className="grid h-11 w-11 place-items-center text-ink-600 disabled:opacity-30 active:bg-ink-100 dark:text-ink-300 dark:active:bg-ink-800"
        disabled={!canRedo}
        onClick={() => useProjectStore.getState().redo()}
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
      >
        <Icon name="redo" />
      </button>
    </div>
  );
}

function SelectionBar() {
  const doc = useProjectStore((s) => s.doc);
  const selectedIds = useProjectStore((s) => s.selectedIds);
  const openSheet = useUIStore((s) => s.openSheet);
  if (!doc) return null;
  const layers = doc.layers.filter((l) => selectedIds.includes(l.id));
  if (!layers.length) return null;
  const one = layers.length === 1 ? layers[0] : null;

  return (
    <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-ink-200 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
      {one?.type === 'photo' && one.photoId && (
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openSheet('photoEdit')}>
          Adjust
        </button>
      )}
      {one?.type === 'photo' && (
        <button
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => {
            useUIStore.getState().setPickerTarget({ kind: 'fill', layerId: one.id });
            useUIStore.getState().go('library');
          }}
        >
          {one.photoId ? 'Swap' : 'Fill'}
        </button>
      )}
      {one?.type === 'text' && (
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openSheet('text')}>
          Edit text
        </button>
      )}
      <button
        className="btn-ghost px-2 py-1 text-xs"
        onClick={() => useProjectStore.getState().duplicateLayers(selectedIds)}
      >
        Duplicate
      </button>
      <button
        className="btn-ghost px-2 py-1 text-xs"
        onClick={() => useProjectStore.getState().reorderLayer(selectedIds[0], 'front')}
      >
        To front
      </button>
      <button
        className="btn-ghost px-2 py-1 text-xs"
        onClick={() => useProjectStore.getState().reorderLayer(selectedIds[0], 'back')}
      >
        To back
      </button>
      <button
        className="btn-ghost px-2 py-1 text-xs text-red-500"
        onClick={() => useProjectStore.getState().removeLayers(selectedIds)}
      >
        Delete
      </button>
    </div>
  );
}

function ToolButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-ink-500 transition-colors active:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:active:bg-ink-800 dark:hover:text-ink-100"
      onClick={onClick}
    >
      <Icon name={icon} size={22} />
      <span className="text-[10px] font-semibold tracking-wide">{label}</span>
    </button>
  );
}

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
      const store = useProjectStore.getState();
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }

      // destructive/nudge shortcuts only act on the bare canvas — with a
      // sheet open, Backspace after tapping one of its buttons must not
      // delete the layer being edited underneath
      if (useUIStore.getState().sheet !== 'none') return;

      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (store.selectedIds.length) store.duplicateLayers(store.selectedIds);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedIds.length) {
        e.preventDefault();
        store.removeLayers(store.selectedIds);
        return;
      }
      if (e.key.startsWith('Arrow') && store.selectedIds.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        store.updateLayers(store.selectedIds, (l) => ({ ...l, x: l.x + dx, y: l.y + dy }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
