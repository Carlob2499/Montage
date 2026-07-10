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
import PhotoEditSheet from './PhotoEditSheet';
import { addTextLayer } from './canvasActions';
import { layerBBox } from '../../lib/renderer';
import { seamsCrossed } from '../../lib/slicer';

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

  const seamWarnings = countSeamWarnings();
  const selectedPhotoLayer = doc.layers.find(
    (l) => selectedIds.includes(l.id) && l.type === 'photo' && l.photoId,
  );

  return (
    <div className="flex h-full flex-col">
      {/* top bar */}
      <header className="z-10 flex items-center gap-1 border-b border-ink-200 bg-white/90 px-2 py-1.5 backdrop-blur dark:border-ink-700 dark:bg-ink-900/90 pt-[max(env(safe-area-inset-top),0.375rem)]">
        <button
          className="btn-ghost px-2"
          onClick={async () => {
            await useProjectStore.getState().save();
            go('home');
          }}
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">{doc.name}</div>
          <div className="text-[11px] leading-tight text-ink-400">
            {doc.mode === 'grid' ? `3×${doc.panelCount} grid` : `${doc.panelCount} panels · ${doc.aspect}`}
            {dirty ? ' · unsaved' : ' · saved'}
          </div>
        </div>
        <UndoRedo />
        <button className="btn-ghost px-2.5 text-sm" onClick={() => go('preview')}>
          Preview
        </button>
        <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => openSheet('export')}>
          Export
        </button>
      </header>

      {/* seam safety warning */}
      {seamWarnings > 0 && (
        <div className="z-10 bg-red-500/10 px-4 py-1 text-center text-xs font-medium text-red-600 dark:text-red-400">
          ⚠ {seamWarnings} seam-safety warning(s): text or key subject sits on a slice line
        </div>
      )}

      {/* canvas */}
      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden bg-ink-100 dark:bg-ink-950">
        <CanvasStage viewport={viewport} />
        {selectedIds.length > 0 && <SelectionBar />}
      </div>

      {/* bottom toolbar */}
      <nav className="z-10 flex items-stretch justify-around border-t border-ink-200 bg-white/95 backdrop-blur dark:border-ink-700 dark:bg-ink-900/95 pb-[max(env(safe-area-inset-bottom),0.25rem)]">
        <ToolButton icon="🖼" label="Photos" onClick={() => {
          useUIStore.getState().setPickerTarget({ kind: 'layer' });
          go('library');
        }} />
        <ToolButton icon="🅃" label="Text" onClick={() => { addTextLayer(); openSheet('text'); }} />
        <ToolButton icon="▦" label="Layouts" onClick={() => openSheet('templates')} />
        <ToolButton icon="🎨" label="Backdrop" onClick={() => openSheet('background')} />
        <ToolButton icon="⬚" label="Panels" onClick={() => openSheet('panels')} />
        <ToolButton icon="≣" label="Layers" onClick={() => openSheet('layers')} />
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
      {sheet === 'photoEdit' && selectedPhotoLayer?.type === 'photo' && (
        <PhotoEditSheet photoId={selectedPhotoLayer.photoId} onClose={closeSheet} />
      )}
    </div>
  );
}

function countSeamWarnings(): number {
  const doc = useProjectStore.getState().doc;
  if (!doc || doc.mode !== 'carousel') return 0;
  const warned = new Set<number>();
  for (const layer of doc.layers) {
    if (layer.type === 'text' || (layer.type === 'photo' && layer.isSubject)) {
      for (const s of seamsCrossed(layerBBox(layer), doc.panelCount, 40)) warned.add(s);
    }
  }
  return warned.size;
}

function UndoRedo() {
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  return (
    <>
      <button
        className="btn-ghost px-2"
        disabled={!canUndo}
        onClick={() => useProjectStore.getState().undo()}
        title="Undo (⌘Z)"
      >
        ↺
      </button>
      <button
        className="btn-ghost px-2"
        disabled={!canRedo}
        onClick={() => useProjectStore.getState().redo()}
        title="Redo (⇧⌘Z)"
      >
        ↻
      </button>
    </>
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

function ToolButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-ink-600 active:bg-ink-100 dark:text-ink-300 dark:active:bg-ink-800"
      onClick={onClick}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const store = useProjectStore.getState();
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
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
