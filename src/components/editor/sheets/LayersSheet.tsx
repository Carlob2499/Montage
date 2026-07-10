import Sheet from '../../shared/Sheet';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { Slider } from './TextSheet';
import type { Layer, PhotoLayer } from '../../../types';

export default function LayersSheet({ onClose }: { onClose: () => void }) {
  const doc = useProjectStore((s) => s.doc);
  const selectedIds = useProjectStore((s) => s.selectedIds);
  if (!doc) return null;
  const store = useProjectStore.getState();
  const selected = doc.layers.find((l) => selectedIds.includes(l.id));

  return (
    <Sheet title="Layers" onClose={onClose} tall>
      <div className="space-y-1.5">
        {[...doc.layers].reverse().map((layer) => (
          <LayerRow key={layer.id} layer={layer} active={selectedIds.includes(layer.id)} />
        ))}
        {doc.layers.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-400">No layers yet.</p>
        )}
      </div>

      {selected && (
        <div className="mt-4 space-y-3 border-t border-ink-200 pt-4 dark:border-ink-700">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Selected: {layerLabel(selected)}
          </h4>
          <Slider
            label="Opacity"
            min={0.05}
            max={1}
            step={0.05}
            value={selected.opacity}
            onChange={(v) =>
              store.updateLayers([selected.id], (l) => ({ ...l, opacity: v }), { transient: true })
            }
          />
          {selected.type === 'photo' && (
            <PhotoControls layer={selected as PhotoLayer} />
          )}
          <div className="flex gap-2">
            <button
              className="btn-soft flex-1 text-xs"
              onClick={() =>
                store.updateLayers([selected.id], (l) => ({ ...l, locked: !l.locked }))
              }
            >
              {selected.locked ? '🔓 Unlock' : '🔒 Lock'}
            </button>
            <button
              className="btn-soft flex-1 text-xs"
              onClick={() => store.reorderLayer(selected.id, 'up')}
            >
              Raise
            </button>
            <button
              className="btn-soft flex-1 text-xs"
              onClick={() => store.reorderLayer(selected.id, 'down')}
            >
              Lower
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function PhotoControls({ layer }: { layer: PhotoLayer }) {
  const store = useProjectStore.getState();
  const patch = (p: Partial<PhotoLayer>) =>
    store.updateLayers([layer.id], (l) => ({ ...(l as PhotoLayer), ...p }), { transient: true });
  return (
    <>
      <Slider
        label="Zoom in frame"
        min={1}
        max={3}
        step={0.02}
        value={layer.imgScale}
        onChange={(v) => patch({ imgScale: v })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Slider
          label="Pan X"
          min={-1}
          max={1}
          step={0.02}
          value={layer.imgOffsetX}
          onChange={(v) => patch({ imgOffsetX: v })}
        />
        <Slider
          label="Pan Y"
          min={-1}
          max={1}
          step={0.02}
          value={layer.imgOffsetY}
          onChange={(v) => patch({ imgOffsetY: v })}
        />
      </div>
      <Slider
        label="Corner radius"
        min={0}
        max={200}
        value={layer.cornerRadius}
        onChange={(v) => patch({ cornerRadius: v })}
      />
      <label className="flex items-center justify-between rounded-xl bg-ink-100 px-3 py-2.5 text-sm dark:bg-ink-800">
        <span>
          Key subject
          <span className="block text-[11px] text-ink-400">Warn if it crosses a slice line</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-blue-500"
          checked={!!layer.isSubject}
          onChange={(e) =>
            store.updateLayers([layer.id], (l) => ({ ...l, isSubject: e.target.checked }))
          }
        />
      </label>
      <button
        className="btn-soft w-full text-xs"
        onClick={() => useUIStore.getState().openSheet('stickers')}
      >
        Add sticker / overlay PNG…
      </button>
    </>
  );
}

function LayerRow({ layer, active }: { layer: Layer; active: boolean }) {
  const store = useProjectStore.getState();
  return (
    <button
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
        active ? 'bg-accent-500/10 ring-1 ring-accent-500' : 'bg-ink-100 dark:bg-ink-800'
      }`}
      onClick={() => store.select([layer.id])}
    >
      <span className="text-base">
        {layer.type === 'photo' ? '🖼' : layer.type === 'text' ? '🅃' : '✦'}
      </span>
      <span className="min-w-0 flex-1 truncate">{layerLabel(layer)}</span>
      {layer.locked && <span className="text-xs">🔒</span>}
    </button>
  );
}

function layerLabel(layer: Layer): string {
  if (layer.type === 'text') return layer.text.split('\n')[0].slice(0, 28) || 'Text';
  if (layer.type === 'photo') return layer.name ?? (layer.photoId ? 'Photo' : 'Empty cell');
  return 'Sticker';
}
