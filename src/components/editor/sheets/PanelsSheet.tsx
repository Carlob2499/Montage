import Sheet from '../../shared/Sheet';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { Slider } from './TextSheet';
import { layerBBox } from '../../../lib/renderer';
import { reorderPanels, panelsCovered, seamsCrossed } from '../../../lib/slicer';
import { PANEL_WIDTH } from '../../../types';

export default function PanelsSheet({ onClose }: { onClose: () => void }) {
  const doc = useProjectStore((s) => s.doc);
  const openSheet = useUIStore((s) => s.openSheet);
  if (!doc) return null;
  const isGrid = doc.mode === 'grid';
  const store = useProjectStore.getState();

  const setCount = (count: number) => {
    store.commit((d) => ({
      ...d,
      panelCount: count,
      captions: isGrid
        ? d.captions
        : Array.from({ length: count }, (_, i) => d.captions[i] ?? ''),
    }));
  };

  const movePanel = (from: number, to: number) => {
    if (to < 0 || to >= doc.panelCount || from === to) return;
    const boxes = doc.layers.map((l) => ({ id: l.id, bbox: layerBBox(l) }));
    const { offsets, captions } = reorderPanels(boxes, doc.captions, doc.panelCount, from, to);
    store.commit((d) => ({
      ...d,
      captions,
      layers: d.layers.map((l) =>
        offsets.has(l.id) ? { ...l, x: l.x + offsets.get(l.id)! } : l,
      ),
    }));
  };

  const insertPanel = (at: number) => {
    if (doc.panelCount >= 30) return;
    store.commit((d) => {
      const captions = [...d.captions];
      captions.splice(at, 0, '');
      return {
        ...d,
        panelCount: d.panelCount + 1,
        captions,
        layers: d.layers.map((l) => {
          const bbox = layerBBox(l);
          const center = bbox.x + bbox.width / 2;
          return center >= at * PANEL_WIDTH ? { ...l, x: l.x + PANEL_WIDTH } : l;
        }),
      };
    });
  };

  const deletePanel = (at: number) => {
    if (doc.panelCount <= 1) return;
    if (!confirm(`Delete panel ${at + 1}? Layers inside it are removed.`)) return;
    store.commit((d) => {
      const captions = d.captions.filter((_, i) => i !== at);
      const keep = d.layers.filter((l) => {
        const bbox = layerBBox(l);
        const spansSeam = seamsCrossed(bbox, d.panelCount).length > 0;
        const inPanel = panelsCovered(bbox, d.panelCount).includes(at) && !spansSeam;
        return !inPanel;
      });
      return {
        ...d,
        panelCount: d.panelCount - 1,
        captions,
        layers: keep.map((l) => {
          const bbox = layerBBox(l);
          const center = bbox.x + bbox.width / 2;
          return center > (at + 1) * PANEL_WIDTH ? { ...l, x: l.x - PANEL_WIDTH } : l;
        }),
      };
    });
  };

  return (
    <Sheet title={isGrid ? 'Grid rows' : 'Panels'} onClose={onClose}>
      <div className="space-y-4">
        <Slider
          label={isGrid ? 'Rows (3 tiles each)' : 'Panel count'}
          min={1}
          max={isGrid ? 8 : 20}
          value={doc.panelCount}
          onChange={setCount}
        />
        {!isGrid && (
          <>
            <div className="space-y-1.5">
              {Array.from({ length: doc.panelCount }, (_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-xl bg-ink-100 px-3 py-2 text-sm dark:bg-ink-800"
                >
                  <span className="w-16 font-medium">Panel {i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-400">
                    {doc.captions[i] ? doc.captions[i].slice(0, 40) : 'no caption'}
                  </span>
                  <button className="btn-ghost px-1.5 py-1 text-xs" disabled={i === 0} onClick={() => movePanel(i, i - 1)}>
                    ◀
                  </button>
                  <button
                    className="btn-ghost px-1.5 py-1 text-xs"
                    disabled={i === doc.panelCount - 1}
                    onClick={() => movePanel(i, i + 1)}
                  >
                    ▶
                  </button>
                  <button className="btn-ghost px-1.5 py-1 text-xs" title="Insert after" onClick={() => insertPanel(i + 1)}>
                    +
                  </button>
                  <button
                    className="btn-ghost px-1.5 py-1 text-xs text-red-500"
                    disabled={doc.panelCount <= 1}
                    onClick={() => deletePanel(i)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button className="btn-soft w-full" onClick={() => openSheet('captions')}>
              Edit captions…
            </button>
          </>
        )}
        <Slider
          label="Canvas margin guide"
          min={0}
          max={160}
          value={doc.margin}
          onChange={(v) => store.commit((d) => ({ ...d, margin: v }))}
        />
        <Slider
          label="Default gutter"
          min={0}
          max={120}
          value={doc.gutter}
          onChange={(v) => store.commit((d) => ({ ...d, gutter: v }))}
        />
        <p className="text-xs text-ink-400">
          Blue dashed lines are slice boundaries. Content crossing them flows seamlessly across
          panels — but keep faces and text away (red = warning).
        </p>
      </div>
    </Sheet>
  );
}
