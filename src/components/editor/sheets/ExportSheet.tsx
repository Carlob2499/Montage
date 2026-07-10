import { useState } from 'react';
import Sheet from '../../shared/Sheet';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { Slider } from './TextSheet';
import {
  bundleZip,
  downloadBlob,
  exportGridTiles,
  exportPanels,
  exportPanorama,
  slug,
} from '../../../lib/exporter';
import type { ExportedFile, ExportOptions } from '../../../lib/exporter';

type Target = 'panels' | 'grid' | 'panorama';
type Delivery = 'files' | 'zip';

export default function ExportSheet({ onClose }: { onClose: () => void }) {
  const doc = useProjectStore((s) => s.doc);
  const toast = useUIStore((s) => s.toast);
  const openSheet = useUIStore((s) => s.openSheet);
  const [format, setFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg');
  const [quality, setQuality] = useState(0.92);
  const [target, setTarget] = useState<Target>(doc?.mode === 'grid' ? 'grid' : 'panels');
  const [delivery, setDelivery] = useState<Delivery>('zip');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  if (!doc) return null;

  const run = async () => {
    await useProjectStore.getState().save();
    const opts: ExportOptions = {
      format,
      quality,
      onProgress: (done, total) => setProgress({ done, total }),
    };
    setProgress({ done: 0, total: 1 });
    try {
      let files: ExportedFile[];
      if (target === 'panorama') {
        const pano = await exportPanorama(doc, opts);
        if (pano.scale < 1) {
          toast(
            `Panorama downscaled to ${Math.round(pano.scale * 100)}% to stay inside mobile canvas limits`,
          );
        }
        files = [pano];
      } else if (target === 'grid' || doc.mode === 'grid') {
        files = await exportGridTiles(doc, opts);
      } else {
        files = await exportPanels(doc, opts);
      }
      if (delivery === 'zip' && target !== 'panorama') {
        const zip = await bundleZip(doc, files);
        downloadBlob(zip, `${slug(doc.name)}.zip`);
      } else {
        // stagger downloads — browsers drop rapid successive programmatic
        // downloads (mobile especially); ZIP is the reliable multi-file path
        for (let i = 0; i < files.length; i++) {
          downloadBlob(files[i].blob, files[i].name);
          if (i < files.length - 1) await new Promise((r) => setTimeout(r, 400));
        }
        if (files.length > 3) {
          toast('If some files didn’t save, use the ZIP delivery instead');
        }
      }
      toast(`Exported ${files.length} file(s) ✓`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setProgress(null);
    }
  };

  const sizeLabel =
    doc.mode === 'grid'
      ? '1080×1080 tiles'
      : doc.aspect === '4:5'
        ? '1080×1350'
        : doc.aspect === '1:1'
          ? '1080×1080'
          : '1080×1920';

  return (
    <Sheet title="Export" onClose={onClose}>
      <div className="space-y-4">
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">What</h4>
          {doc.mode === 'carousel' ? (
            <>
              <TargetRow
                active={target === 'panels'}
                title={`Carousel panels (${doc.panelCount})`}
                subtitle={`${sizeLabel} sRGB, numbered in swipe order`}
                onClick={() => setTarget('panels')}
              />
              <TargetRow
                active={target === 'panorama'}
                title="Full panorama"
                subtitle="One wide image of the whole canvas"
                onClick={() => setTarget('panorama')}
              />
            </>
          ) : (
            <TargetRow
              active
              title={`Profile-grid tiles (3×${doc.panelCount})`}
              subtitle="Named in correct upload order (bottom-right first)"
              onClick={() => setTarget('grid')}
            />
          )}
        </section>

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Format</h4>
          <div className="flex gap-2">
            <button
              className={`btn flex-1 border ${format === 'image/jpeg' ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 dark:border-ink-700'}`}
              onClick={() => setFormat('image/jpeg')}
            >
              JPEG
            </button>
            <button
              className={`btn flex-1 border ${format === 'image/png' ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 dark:border-ink-700'}`}
              onClick={() => setFormat('image/png')}
            >
              PNG
            </button>
          </div>
          {format === 'image/jpeg' && (
            <Slider label="JPEG quality" min={0.5} max={1} step={0.01} value={quality} onChange={setQuality} />
          )}
        </section>

        {target !== 'panorama' && (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Delivery</h4>
            <div className="flex gap-2">
              <button
                className={`btn flex-1 border ${delivery === 'zip' ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 dark:border-ink-700'}`}
                onClick={() => setDelivery('zip')}
              >
                One ZIP (+captions.txt)
              </button>
              <button
                className={`btn flex-1 border ${delivery === 'files' ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 dark:border-ink-700'}`}
                onClick={() => setDelivery('files')}
              >
                Separate files
              </button>
            </div>
          </section>
        )}

        {doc.mode === 'carousel' && (
          <button className="btn-soft w-full text-xs" onClick={() => openSheet('captions')}>
            Edit per-panel captions…
          </button>
        )}

        <button className="btn-primary w-full" disabled={!!progress} onClick={() => void run()}>
          {progress ? `Rendering ${progress.done}/${progress.total}…` : 'Export'}
        </button>
        {progress && (
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
            <div
              className="h-full bg-accent-500 transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        )}
        <p className="text-center text-[11px] text-ink-400">
          Full-resolution originals are used — on-screen proxies never touch the export. Panoramic
          MP4 export is planned for a later version.
        </p>
      </div>
    </Sheet>
  );
}

function TargetRow({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`w-full rounded-xl border p-3 text-left ${
        active ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 dark:border-ink-700'
      }`}
      onClick={onClick}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-ink-400">{subtitle}</div>
    </button>
  );
}
