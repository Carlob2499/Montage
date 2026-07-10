import Sheet from '../../shared/Sheet';
import { useProjectStore } from '../../../state/projectStore';
import { FONTS } from '../../../lib/fonts';
import type { TextLayer } from '../../../types';

const SWATCHES = [
  '#18181b', '#ffffff', '#f5e9d0', '#e11d48', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#0e1b25',
];

export default function TextSheet({ onClose }: { onClose: () => void }) {
  const doc = useProjectStore((s) => s.doc);
  const selectedIds = useProjectStore((s) => s.selectedIds);
  const layer = doc?.layers.find((l) => selectedIds.includes(l.id) && l.type === 'text') as
    | TextLayer
    | undefined;

  if (!layer) {
    return (
      <Sheet title="Text" onClose={onClose}>
        <p className="text-sm text-ink-400">Select a text layer (or add one from the toolbar).</p>
      </Sheet>
    );
  }

  const patch = (p: Partial<TextLayer>) =>
    useProjectStore.getState().updateLayers([layer.id], (l) => ({ ...(l as TextLayer), ...p }));
  // sliders and typing preview per tick, then land as one undo entry
  const patchT = (p: Partial<TextLayer>) =>
    useProjectStore
      .getState()
      .updateLayers([layer.id], (l) => ({ ...(l as TextLayer), ...p }), { transient: true });

  return (
    <Sheet title="Text" onClose={onClose}>
      <div className="space-y-4">
        <textarea
          className="input-base min-h-20 font-medium"
          value={layer.text}
          onChange={(e) => patchT({ text: e.target.value })}
          onBlur={() => useProjectStore.getState().commitPreview()}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            className="input-base"
            value={layer.fontFamily}
            onChange={(e) => patch({ fontFamily: e.target.value })}
          >
            {FONTS.map((f) => (
              <option key={f.family} value={f.family}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className="input-base"
            value={layer.fontWeight}
            onChange={(e) => patch({ fontWeight: Number(e.target.value) })}
          >
            {(FONTS.find((f) => f.family === layer.fontFamily)?.weights ?? [400, 700]).map((w) => (
              <option key={w} value={w}>
                Weight {w}
              </option>
            ))}
          </select>
        </div>
        <Slider label="Size" min={12} max={400} value={layer.fontSize} onChange={(v) => patchT({ fontSize: v })} />
        <Slider
          label="Letter spacing"
          min={-5}
          max={40}
          value={layer.letterSpacing}
          onChange={(v) => patchT({ letterSpacing: v })}
        />
        <Slider
          label="Line height"
          min={0.8}
          max={2.2}
          step={0.05}
          value={layer.lineHeight}
          onChange={(v) => patchT({ lineHeight: v })}
        />
        <div className="flex items-center gap-2">
          <span className="w-20 text-xs text-ink-500">Align</span>
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              className={`btn flex-1 border text-xs ${
                layer.align === a
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-ink-200 dark:border-ink-700'
              }`}
              onClick={() => patch({ align: a })}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-ink-500">Color</span>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={`h-7 w-7 rounded-full border ${
                  layer.fill === c ? 'ring-2 ring-accent-500 ring-offset-1' : 'border-ink-200 dark:border-ink-600'
                }`}
                style={{ backgroundColor: c }}
                onClick={() => patch({ fill: c })}
              />
            ))}
            <input
              type="color"
              value={layer.fill}
              className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
              onChange={(e) => patchT({ fill: e.target.value })}
              onBlur={() => useProjectStore.getState().commitPreview()}
            />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

export function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
}) {
  // Sliders update via preview() per tick; the whole drag lands as ONE undo
  // entry when the pointer lifts. commitPreview() is a no-op when the slider
  // didn't touch the project store (e.g. export quality).
  const finish = () => {
    useProjectStore.getState().commitPreview();
    onCommit?.();
  };
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs text-ink-500">
        <span>{label}</span>
        <b className="tabular-nums text-ink-900 dark:text-ink-100">
          {Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={finish}
        onKeyUp={finish}
        onBlur={finish}
      />
    </label>
  );
}
