import Sheet from '../../shared/Sheet';
import { Slider } from './TextSheet';
import { useProjectStore } from '../../../state/projectStore';
import type { Layer, LayerShadow, LayerStroke, MaskShape } from '../../../types';

const DEFAULT_SHADOW: LayerShadow = { color: 'rgba(0,0,0,0.35)', blur: 18, offsetX: 0, offsetY: 10 };
const DEFAULT_STROKE: LayerStroke = { color: '#ffffff', width: 8 };

const SHADOW_COLORS = ['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.6)', 'rgba(124,92,255,0.5)', 'rgba(0,0,0,0.18)'];
const STROKE_COLORS = ['#ffffff', '#000000', '#7c5cff', '#f43f5e', '#fbbf24'];
const SHAPES: { key: MaskShape | 'none'; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'circle', label: 'Circle' },
  { key: 'arch', label: 'Arch' },
  { key: 'heart', label: 'Heart' },
  { key: 'blob', label: 'Blob' },
];

export default function EffectsSheet({ onClose }: { onClose: () => void }) {
  const doc = useProjectStore((s) => s.doc);
  const selectedIds = useProjectStore((s) => s.selectedIds);
  if (!doc) return null;
  const layers = doc.layers.filter((l) => selectedIds.includes(l.id));
  if (!layers.length) return null;
  const rep = layers[0];
  const strokeable = layers.some((l) => l.type === 'photo' || l.type === 'card');
  const maskable = layers.some((l) => l.type === 'photo');

  const patch = (fn: (l: Layer) => Layer, transient = false) =>
    useProjectStore.getState().updateLayers(selectedIds, fn, { transient });

  const shadow = rep.shadow;
  const setShadow = (s: LayerShadow | undefined, transient = false) =>
    patch((l) => ({ ...l, shadow: s }), transient);
  const patchShadow = (delta: Partial<LayerShadow>, transient = false) =>
    patch((l) => ({ ...l, shadow: { ...(l.shadow ?? DEFAULT_SHADOW), ...delta } }), transient);

  const repStroke = rep.type === 'photo' || rep.type === 'card' ? rep.stroke : undefined;
  const setStroke = (s: LayerStroke | undefined) =>
    patch((l) => (l.type === 'photo' || l.type === 'card' ? { ...l, stroke: s } : l));
  const patchStroke = (delta: Partial<LayerStroke>, transient = false) =>
    patch(
      (l) =>
        l.type === 'photo' || l.type === 'card'
          ? { ...l, stroke: { ...(l.stroke ?? DEFAULT_STROKE), ...delta } }
          : l,
      transient,
    );

  const repMask = rep.type === 'photo' ? rep.maskShape : undefined;
  const setMask = (shape: MaskShape | 'none') =>
    patch((l) => (l.type === 'photo' ? { ...l, maskShape: shape === 'none' ? undefined : shape } : l));

  return (
    <Sheet title="Effects" onClose={onClose}>
      <div className="space-y-5">
        {/* Drop shadow */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Drop shadow</h4>
            <Toggle on={!!shadow} onClick={() => setShadow(shadow ? undefined : DEFAULT_SHADOW)} />
          </div>
          {shadow && (
            <div className="space-y-2.5">
              <Slider
                label="Blur"
                min={0}
                max={60}
                value={shadow.blur}
                onChange={(v) => patchShadow({ blur: v }, true)}
              />
              <Slider
                label="Distance"
                min={0}
                max={40}
                value={shadow.offsetY}
                onChange={(v) => patchShadow({ offsetY: v }, true)}
              />
              <Swatches
                colors={SHADOW_COLORS}
                active={shadow.color}
                onPick={(c) => patchShadow({ color: c })}
              />
            </div>
          )}
        </section>

        {/* Border */}
        {strokeable && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Border</h4>
              <Toggle on={!!repStroke} onClick={() => setStroke(repStroke ? undefined : DEFAULT_STROKE)} />
            </div>
            {repStroke && (
              <div className="space-y-2.5">
                <Slider
                  label="Width"
                  min={1}
                  max={28}
                  value={repStroke.width}
                  onChange={(v) => patchStroke({ width: v }, true)}
                />
                <Swatches
                  colors={STROKE_COLORS}
                  active={repStroke.color}
                  onPick={(c) => patchStroke({ color: c })}
                />
              </div>
            )}
          </section>
        )}

        {/* Shape mask (photos) */}
        {maskable && (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">Shape</h4>
            <div className="flex flex-wrap gap-1.5">
              {SHAPES.map((s) => {
                const active = (repMask ?? 'none') === s.key;
                return (
                  <button
                    key={s.key}
                    className={active ? 'chip-active' : 'chip'}
                    onClick={() => setMask(s.key)}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-400">Masks apply to plain photos (not framed ones).</p>
          </section>
        )}
      </div>
    </Sheet>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-accent-500' : 'bg-ink-300 dark:bg-ink-600'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

function Swatches({
  colors,
  active,
  onPick,
}: {
  colors: string[];
  active: string;
  onPick: (c: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-500">Color</span>
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          aria-label={`Color ${c}`}
          className={`h-7 w-7 rounded-full border ${
            active === c ? 'ring-2 ring-accent-500 ring-offset-1 dark:ring-offset-ink-900' : 'border-ink-200 dark:border-ink-700'
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
