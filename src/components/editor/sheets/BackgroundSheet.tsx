import Sheet from '../../shared/Sheet';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { Slider } from './TextSheet';
import type { Background } from '../../../types';

const SOLIDS = ['#ffffff', '#fafaf9', '#f4f1ea', '#e9e5dd', '#101014', '#0e1b25', '#17121c', '#1c1917'];
const GRADIENTS: [string, string][] = [
  ['#fde68a', '#f97316'],
  ['#a5f3fc', '#3b82f6'],
  ['#fbcfe8', '#8b5cf6'],
  ['#e8ddcb', '#d4c5a9'],
  ['#e5e7eb', '#f9fafb'],
  ['#2b2140', '#120d1d'],
];

export default function BackgroundSheet({ onClose }: { onClose: () => void }) {
  const bg = useProjectStore((s) => s.doc?.background);
  const setBackground = useProjectStore((s) => s.setBackground);
  if (!bg) return null;

  const set = (b: Background) => setBackground(b);
  // slider/color-picker drags preview per tick, landing as one undo entry
  const setT = (b: Background) =>
    useProjectStore.getState().preview((d) => ({ ...d, background: b }));

  return (
    <Sheet title="Backdrop" onClose={onClose}>
      <div className="space-y-5">
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Solid</h4>
          <div className="flex flex-wrap gap-2">
            {SOLIDS.map((c) => (
              <button
                key={c}
                className={`h-10 w-10 rounded-xl border border-ink-200 dark:border-ink-600 ${
                  bg.kind === 'solid' && bg.color === c ? 'ring-2 ring-accent-500 ring-offset-1' : ''
                }`}
                style={{ backgroundColor: c }}
                onClick={() => set({ kind: 'solid', color: c })}
              />
            ))}
            <input
              type="color"
              className="h-10 w-12 cursor-pointer rounded-xl border-0 bg-transparent p-0"
              value={bg.kind === 'solid' ? bg.color : '#ffffff'}
              onChange={(e) => setT({ kind: 'solid', color: e.target.value })}
              onBlur={() => useProjectStore.getState().commitPreview()}
            />
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Gradient</h4>
          <div className="flex flex-wrap gap-2">
            {GRADIENTS.map(([from, to]) => (
              <button
                key={from + to}
                className="h-10 w-14 rounded-xl border border-ink-200 dark:border-ink-600"
                style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                onClick={() => set({ kind: 'linear', from, to, angle: 135 })}
              />
            ))}
            {GRADIENTS.slice(0, 3).map(([from, to]) => (
              <button
                key={`r${from}`}
                className="h-10 w-14 rounded-xl border border-ink-200 dark:border-ink-600"
                style={{ background: `radial-gradient(circle, ${from}, ${to})` }}
                onClick={() => set({ kind: 'radial', from, to })}
              />
            ))}
          </div>
          {bg.kind === 'linear' && (
            <div className="mt-3 space-y-3">
              <Slider label="Angle" min={0} max={360} value={bg.angle} onChange={(v) => setT({ ...bg, angle: v })} />
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-xs text-ink-500">
                  From
                  <input
                    type="color"
                    value={bg.from}
                    onChange={(e) => setT({ ...bg, from: e.target.value })}
                    onBlur={() => useProjectStore.getState().commitPreview()}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-ink-500">
                  To
                  <input
                    type="color"
                    value={bg.to}
                    onChange={(e) => setT({ ...bg, to: e.target.value })}
                    onBlur={() => useProjectStore.getState().commitPreview()}
                  />
                </label>
              </div>
            </div>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Blurred photo</h4>
          <button
            className="btn-soft w-full"
            onClick={() => {
              useUIStore.getState().setPickerTarget({ kind: 'background' });
              useUIStore.getState().go('library');
            }}
          >
            {bg.kind === 'blurPhoto' ? 'Change photo…' : 'Pick a photo to blur…'}
          </button>
          {bg.kind === 'blurPhoto' && (
            <div className="mt-3 space-y-3">
              <Slider label="Blur" min={0} max={100} value={bg.blur} onChange={(v) => setT({ ...bg, blur: v })} />
              <Slider
                label="Darken"
                min={0}
                max={0.8}
                step={0.05}
                value={bg.dim}
                onChange={(v) => setT({ ...bg, dim: v })}
              />
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}
