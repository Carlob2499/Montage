import { useEffect, useMemo, useRef, useState } from 'react';
import Sheet from '../../shared/Sheet';
import { TEMPLATES } from '../../../templates/templates';
import { validateTemplateLibrary, TEMPLATE_CATEGORIES } from '../../../lib/templateSchema';
import { applyTemplate, applyStructuredGrid, reshuffleLayout } from '../canvasActions';
import { templateThumbnail } from '../../../lib/templateThumbnail';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { confirmAction } from '../../../state/dialogStore';
import type { TemplateCategory, TemplateDef } from '../../../types';

export default function TemplatesSheet({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<TemplateCategory | 'all' | 'grids'>('all');
  const toast = useUIStore((s) => s.toast);
  const { valid } = useMemo(() => validateTemplateLibrary(TEMPLATES), []);
  const shown = valid.filter((t) => category === 'all' || t.category === category);

  const apply = async (t: TemplateDef) => {
    const replace = await confirmAction({
      title: `Apply "${t.name}"?`,
      message: `${t.panels} panel${t.panels > 1 ? 's' : ''}. Replace your current layers, or add this on top of them?`,
      confirmLabel: 'Replace layers',
      cancelLabel: 'Add on top',
    });
    applyTemplate(t, replace);
    toast(`Applied ${t.name} — tap a cell to fill it`, 'success');
    onClose();
  };

  const hasPhotos = useProjectStore(
    (s) => s.doc?.layers.some((l) => l.type === 'photo' && l.photoId) ?? false,
  );

  return (
    <Sheet title="Layouts & templates" onClose={onClose} tall>
      {hasPhotos && (
        <div className="mb-3">
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
            One-tap re-layout (photos on canvas)
          </h4>
          <div className="flex gap-2">
            <button className="btn-soft flex-1 text-xs" onClick={() => void reshuffleLayout('dump')}>
              ✨ Shuffle dump
            </button>
            <button className="btn-soft flex-1 text-xs" onClick={() => void reshuffleLayout('clean')}>
              ▦ Clean grid
            </button>
            <button className="btn-soft flex-1 text-xs" onClick={() => void reshuffleLayout('panorama')}>
              ⿲ Panorama
            </button>
          </div>
        </div>
      )}
      <div className="scrollbar-none -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
        {(['all', ...TEMPLATE_CATEGORIES, 'grids'] as const).map((c) => (
          <button
            key={c}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
              category === c
                ? 'bg-accent-500 text-white'
                : 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200'
            }`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {category === 'grids' ? (
        <GridBuilder onDone={onClose} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {shown.map((t) => (
            <button
              key={t.id}
              className="surface overflow-hidden rounded-xl text-left transition-transform active:scale-95"
              onClick={() => void apply(t)}
            >
              <TemplatePreview template={t} />
              <div className="px-2.5 py-2">
                <div className="text-xs font-semibold">{t.name}</div>
                <div className="text-[10px] capitalize text-ink-400">
                  {t.category} · {t.panels} panel{t.panels > 1 ? 's' : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/**
 * Real, high-fidelity preview: renders the template through the export
 * pipeline (gradients, glass, frames, real fonts) with vibrant placeholder
 * fills, lazily on first view and cached. Falls back to a tinted aspect box
 * while the thumbnail rasterizes.
 */
function TemplatePreview({ template }: { template: TemplateDef }) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const ratio = Math.min((template.panels * 1080) / 1350, 2.6);
  const bgHint =
    template.background?.kind === 'solid'
      ? template.background.color
      : template.background?.kind === 'linear' || template.background?.kind === 'radial'
        ? template.background.from
        : '#e5e5e5';

  useEffect(() => {
    let alive = true;
    const el = ref.current;
    if (!el) return;
    // render only when the card scrolls into view (94 templates)
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void templateThumbnail(template).then((u) => {
            if (alive) setUrl(u);
          });
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [template]);

  return (
    <div ref={ref} className="w-full overflow-hidden bg-ink-100 dark:bg-ink-800">
      <div className="relative mx-auto w-full" style={{ aspectRatio: `${ratio}`, background: bgHint }}>
        {url ? (
          <img src={url} alt={template.name} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 animate-pulse bg-black/5 dark:bg-white/5" />
        )}
      </div>
    </div>
  );
}

function GridBuilder({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [spacing, setSpacing] = useState(24);
  const cells = rows * cols;
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-400">
        Structured grid of equal cells added to the current canvas. Resize or delete individual
        cells afterwards to create spans.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-ink-500">
          Rows
          <input
            type="range"
            min={1}
            max={4}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
          />
          <b>{rows}</b>
        </label>
        <label className="text-xs text-ink-500">
          Columns
          <input
            type="range"
            min={1}
            max={6}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
          />
          <b>{cols}</b>
        </label>
      </div>
      <label className="text-xs text-ink-500">
        Spacing
        <input
          type="range"
          min={0}
          max={120}
          value={spacing}
          onChange={(e) => setSpacing(Number(e.target.value))}
        />
        <b>{spacing}px</b>
      </label>
      <button
        className="btn-primary w-full"
        disabled={cells < 2 || cells > 12}
        onClick={() => {
          applyStructuredGrid(rows, cols, spacing);
          onDone();
        }}
      >
        Add {cells}-cell grid
      </button>
      {(cells < 2 || cells > 12) && (
        <p className="text-center text-xs text-red-500">Grids support 2–12 cells.</p>
      )}
    </div>
  );
}
