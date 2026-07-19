import Sheet from '../../shared/Sheet';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { Slider } from './TextSheet';
import type { CardLayer, FrameStyle, Layer, PhotoLayer } from '../../../types';

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
          {selected.type === 'card' && <CardControls layer={selected as CardLayer} />}
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

const FRAME_STYLES: { value: FrameStyle | undefined; label: string }[] = [
  { value: undefined, label: 'Plain' },
  { value: 'polaroid', label: 'Polaroid' },
  { value: 'tape', label: 'Taped' },
  { value: 'torn', label: 'Torn' },
];

function PhotoControls({ layer }: { layer: PhotoLayer }) {
  const store = useProjectStore.getState();
  const patch = (p: Partial<PhotoLayer>) =>
    store.updateLayers([layer.id], (l) => ({ ...(l as PhotoLayer), ...p }), { transient: true });
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-xs text-ink-500">Frame</span>
        {FRAME_STYLES.map((f) => (
          <button
            key={f.label}
            className={`btn flex-1 border px-1 text-xs ${
              layer.frameStyle === f.value
                ? 'border-accent-500 bg-accent-500/10'
                : 'border-ink-200 dark:border-ink-700'
            }`}
            onClick={() =>
              store.updateLayers([layer.id], (l) => ({
                ...(l as PhotoLayer),
                frameStyle: f.value,
              }))
            }
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-400">
        Tip: pinch the photo on the canvas to zoom &amp; drag to reframe it in place.
      </p>
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

function CardControls({ layer }: { layer: CardLayer }) {
  const store = useProjectStore.getState();
  const patch = (p: Partial<CardLayer>, transient = true) =>
    store.updateLayers([layer.id], (l) => ({ ...(l as CardLayer), ...p }), { transient });
  return (
    <>
      <Slider
        label="Corner radius"
        min={0}
        max={200}
        value={layer.cornerRadius}
        onChange={(v) => patch({ cornerRadius: v })}
      />
      <label className="flex items-center justify-between rounded-xl bg-ink-100 px-3 py-2.5 text-sm dark:bg-ink-800">
        <span>Glass effect</span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-blue-500"
          checked={layer.glass}
          onChange={(e) => patch({ glass: e.target.checked }, false)}
        />
      </label>
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-500">Tint</span>
        {['rgba(255,255,255,0.28)', 'rgba(16,16,20,0.35)', '#ffffff', '#101014', '#f5e9d0'].map(
          (c) => (
            <button
              key={c}
              className={`h-7 w-7 rounded-full border border-ink-200 dark:border-ink-600 ${
                layer.fill === c ? 'ring-2 ring-accent-500 ring-offset-1' : ''
              }`}
              style={{ background: c }}
              onClick={() => patch({ fill: c }, false)}
            />
          ),
        )}
      </div>
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
        {layer.type === 'photo' ? '🖼' : layer.type === 'text' ? '🅃' : layer.type === 'card' ? '▭' : '✦'}
      </span>
      <span className="min-w-0 flex-1 truncate">{layerLabel(layer)}</span>
      {layer.locked && <span className="text-xs">🔒</span>}
    </button>
  );
}

function layerLabel(layer: Layer): string {
  if (layer.type === 'text') return layer.text.split('\n')[0].slice(0, 28) || 'Text';
  if (layer.type === 'photo') return layer.name ?? (layer.photoId ? 'Photo' : 'Empty cell');
  if (layer.type === 'card') return layer.glass ? 'Glass card' : 'Card';
  return 'Sticker';
}
