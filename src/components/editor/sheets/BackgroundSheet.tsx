import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from '../../shared/Sheet';
import { db, uid } from '../../../db/db';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { promptText } from '../../../state/dialogStore';
import { Slider } from './TextSheet';
import type { Background, TextLayer } from '../../../types';

const SOLIDS = ['#ffffff', '#fafaf9', '#f4f1ea', '#e9e5dd', '#101014', '#0e1b25', '#17121c', '#1c1917'];
const GRADIENTS: [string, string][] = [
  ['#fde68a', '#f97316'],
  ['#a5f3fc', '#3b82f6'],
  ['#fbcfe8', '#8b5cf6'],
  ['#e8ddcb', '#d4c5a9'],
  ['#e5e7eb', '#f9fafb'],
  ['#2b2140', '#120d1d'],
];
// trend palettes: soft multi-stop "sunset" gradients
const MULTI_GRADIENTS: { name: string; stops: { color: string; at: number }[] }[] = [
  {
    name: 'Dusk',
    stops: [
      { color: '#2d1b4e', at: 0 },
      { color: '#7c3aed', at: 0.35 },
      { color: '#f472b6', at: 0.7 },
      { color: '#fcd9a8', at: 1 },
    ],
  },
  {
    name: 'Peach fizz',
    stops: [
      { color: '#fff1e6', at: 0 },
      { color: '#ffd6ba', at: 0.4 },
      { color: '#fca5a5', at: 0.75 },
      { color: '#c084fc', at: 1 },
    ],
  },
  {
    name: 'Lagoon',
    stops: [
      { color: '#0c4a6e', at: 0 },
      { color: '#0891b2', at: 0.45 },
      { color: '#67e8f9', at: 0.8 },
      { color: '#ecfeff', at: 1 },
    ],
  },
  {
    name: 'Matcha',
    stops: [
      { color: '#f7fee7', at: 0 },
      { color: '#bef264', at: 0.5 },
      { color: '#4d7c0f', at: 1 },
    ],
  },
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
          <div className="mt-2 flex flex-wrap gap-2">
            {MULTI_GRADIENTS.map((g) => (
              <button
                key={g.name}
                title={g.name}
                className="h-10 w-14 rounded-xl border border-ink-200 dark:border-ink-600"
                style={{
                  background: `linear-gradient(160deg, ${g.stops
                    .map((s) => `${s.color} ${s.at * 100}%`)
                    .join(', ')})`,
                }}
                onClick={() =>
                  set({
                    kind: 'linear',
                    from: g.stops[0].color,
                    to: g.stops[g.stops.length - 1].color,
                    angle: 160,
                    stops: g.stops,
                  })
                }
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

        <StyleCollections />

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

/**
 * Saved style collections: capture the current backdrop + text look under a
 * name, apply it to any project later — a consistent feed identity.
 */
function StyleCollections() {
  const styles = useLiveQuery(() => db.styles.orderBy('createdAt').reverse().toArray(), []);
  const toast = useUIStore((s) => s.toast);

  const saveCurrent = async () => {
    const doc = useProjectStore.getState().doc;
    if (!doc) return;
    const name = await promptText({
      title: 'Save style',
      placeholder: 'e.g. warm minimal',
      confirmLabel: 'Save',
    });
    if (!name?.trim()) return;
    const firstText = doc.layers.find((l): l is TextLayer => l.type === 'text');
    await db.styles.add({
      id: uid(),
      name: name.trim(),
      background: structuredClone(doc.background),
      text: {
        fontFamily: firstText?.fontFamily ?? 'Inter',
        fontWeight: firstText?.fontWeight ?? 600,
        fill: firstText?.fill ?? '#18181b',
      },
      createdAt: Date.now(),
    });
    toast(`Style "${name.trim()}" saved`, 'success');
  };

  const apply = (styleId: string) => {
    const style = styles?.find((s) => s.id === styleId);
    if (!style) return;
    useProjectStore.getState().commit((d) => ({
      ...d,
      background: structuredClone(style.background),
      layers: d.layers.map((l) =>
        l.type === 'text'
          ? { ...l, fontFamily: style.text.fontFamily, fontWeight: style.text.fontWeight, fill: style.text.fill }
          : l,
      ),
    }));
    toast(`Applied "${style.name}" — one undo step reverts it`, 'success');
  };

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
        My styles
      </h4>
      <div className="space-y-1.5">
        {styles?.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-xl bg-ink-100 px-2 py-1.5 dark:bg-ink-800">
            <span
              className="h-7 w-10 shrink-0 rounded-lg border border-ink-200 dark:border-ink-600"
              style={{
                background:
                  s.background.kind === 'solid'
                    ? s.background.color
                    : s.background.kind === 'linear'
                      ? `linear-gradient(135deg, ${(s.background.stops ?? [{ color: s.background.from, at: 0 }, { color: s.background.to, at: 1 }])
                          .map((st) => `${st.color} ${st.at * 100}%`)
                          .join(', ')})`
                      : s.background.kind === 'radial'
                        ? `radial-gradient(circle, ${s.background.from}, ${s.background.to})`
                        : '#333',
              }}
            />
            <span className="min-w-0 flex-1 truncate text-sm" style={{ fontFamily: s.text.fontFamily }}>
              {s.name}
            </span>
            <button className="btn-soft px-2 py-1 text-xs" onClick={() => apply(s.id)}>
              Apply
            </button>
            <button
              className="btn-ghost px-1.5 py-1 text-xs text-red-500"
              onClick={() => void db.styles.delete(s.id)}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="btn-soft w-full text-xs" onClick={() => void saveCurrent()}>
          + Save current style
        </button>
      </div>
    </section>
  );
}
