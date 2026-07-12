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
import { canShareFiles, shareFiles, shareSupported, toShareFiles } from '../../../lib/share';
import { exportPanoramaVideo, videoExportSupported } from '../../../lib/videoExport';

type Target = 'panels' | 'grid' | 'panorama' | 'video';
type Delivery = 'share' | 'files' | 'zip';

export default function ExportSheet({ onClose }: { onClose: () => void }) {
  const doc = useProjectStore((s) => s.doc);
  const toast = useUIStore((s) => s.toast);
  const openSheet = useUIStore((s) => s.openSheet);
  const [format, setFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg');
  const [quality, setQuality] = useState(0.92);
  const [target, setTarget] = useState<Target>(doc?.mode === 'grid' ? 'grid' : 'panels');
  const [delivery, setDelivery] = useState<Delivery>(() => (shareSupported() ? 'share' : 'zip'));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // pre-rendered files awaiting the share tap (navigator.share must run
  // synchronously inside a user gesture, so rendering happens on tap 1 and
  // the share sheet opens on tap 2)
  const [prepared, setPrepared] = useState<File[] | null>(null);
  const [videoDuration, setVideoDuration] = useState(8);
  const [recording, setRecording] = useState<number | null>(null);
  if (!doc) return null;

  const runVideo = async () => {
    await useProjectStore.getState().save();
    setRecording(0);
    try {
      const file = await exportPanoramaVideo(doc, {
        durationSec: videoDuration,
        onProgress: (f) => setRecording(f),
      });
      downloadBlob(file.blob, file.name);
      toast(`Recorded ${file.name} ✓`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : 'Video export failed', 'error');
    } finally {
      setRecording(null);
    }
  };

  const renderFiles = async (opts: ExportOptions): Promise<ExportedFile[]> => {
    if (target === 'panorama') {
      const pano = await exportPanorama(doc, opts);
      if (pano.scale < 1) {
        toast(
          `Panorama downscaled to ${Math.round(pano.scale * 100)}% to stay inside mobile canvas limits`,
        );
      }
      return [pano];
    }
    if (target === 'grid' || doc.mode === 'grid') return exportGridTiles(doc, opts);
    return exportPanels(doc, opts);
  };

  const prepareShare = async () => {
    await useProjectStore.getState().save();
    const opts: ExportOptions = {
      format,
      quality,
      onProgress: (done, total) => setProgress({ done, total }),
    };
    setProgress({ done: 0, total: 1 });
    try {
      const files = toShareFiles(await renderFiles(opts));
      if (!canShareFiles(files)) {
        toast('Sharing not supported for these files — use ZIP instead', 'error');
        return;
      }
      setPrepared(files);
      toast('Rendered — tap Share to open the share sheet', 'success');
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : 'Render failed', 'error');
    } finally {
      setProgress(null);
    }
  };

  const shareNow = () => {
    if (!prepared) return;
    // no awaits before share() — the user gesture must stay alive
    void shareFiles(prepared, doc.name)
      .then((shared) => {
        if (shared) {
          toast(`Shared ${prepared.length} file(s) ✓`, 'success');
          setPrepared(null);
          onClose();
        }
      })
      .catch(() => toast('Share failed — try the ZIP delivery', 'error'));
  };

  const run = async () => {
    await useProjectStore.getState().save();
    const opts: ExportOptions = {
      format,
      quality,
      onProgress: (done, total) => setProgress({ done, total }),
    };
    setProgress({ done: 0, total: 1 });
    try {
      const files = await renderFiles(opts);
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
      ? `${doc.panelWidth}×${doc.panelWidth} tiles`
      : `${doc.panelWidth}×${doc.panelHeight}`;

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
                onClick={() => {
                  setTarget('panels');
                  setPrepared(null);
                }}
              />
              <TargetRow
                active={target === 'panorama'}
                title="Full panorama"
                subtitle="One wide image of the whole canvas"
                onClick={() => {
                  setTarget('panorama');
                  setPrepared(null);
                }}
              />
              {videoExportSupported() && doc.panelCount > 1 && (
                <TargetRow
                  active={target === 'video'}
                  title="Auto-scroll video (experimental)"
                  subtitle="Smooth swipe across the canvas — for Reels/TikTok"
                  onClick={() => {
                    setTarget('video');
                    setPrepared(null);
                  }}
                />
              )}
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

        {target === 'video' && (
          <section className="space-y-2">
            <Slider
              label="Scroll duration (s)"
              min={4}
              max={20}
              value={videoDuration}
              onChange={setVideoDuration}
            />
            <p className="text-[11px] text-ink-400">
              Records in real time (≈{videoDuration + 2}s) at {doc.panelWidth}×{doc.panelHeight},
              WebM/MP4 depending on the browser.
            </p>
          </section>
        )}

        <section className={`space-y-2 ${target === 'video' ? 'hidden' : ''}`}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Format</h4>
          <div className="flex gap-2">
            <button
              className={`btn flex-1 border ${format === 'image/jpeg' ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 dark:border-ink-700'}`}
              onClick={() => {
                setFormat('image/jpeg');
                setPrepared(null);
              }}
            >
              JPEG
            </button>
            <button
              className={`btn flex-1 border ${format === 'image/png' ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 dark:border-ink-700'}`}
              onClick={() => {
                setFormat('image/png');
                setPrepared(null);
              }}
            >
              PNG
            </button>
          </div>
          {format === 'image/jpeg' && (
            <Slider
              label="JPEG quality"
              min={0.5}
              max={1}
              step={0.01}
              value={quality}
              onChange={(v) => {
                setQuality(v);
                setPrepared(null);
              }}
            />
          )}
        </section>

        <section className={`space-y-2 ${target === 'video' ? 'hidden' : ''}`}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Delivery</h4>
          <div className="flex gap-2">
            {shareSupported() && (
              <button
                className={`btn flex-1 border ${delivery === 'share' ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 dark:border-ink-700'}`}
                onClick={() => {
                  setDelivery('share');
                  setPrepared(null);
                }}
              >
                📤 Share sheet
              </button>
            )}
            {target !== 'panorama' && (
              <button
                className={`btn flex-1 border ${delivery === 'zip' ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 dark:border-ink-700'}`}
                onClick={() => {
                  setDelivery('zip');
                  setPrepared(null);
                }}
              >
                ZIP (+captions)
              </button>
            )}
            <button
              className={`btn flex-1 border ${delivery === 'files' ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 dark:border-ink-700'}`}
              onClick={() => {
                setDelivery('files');
                setPrepared(null);
              }}
            >
              Files
            </button>
          </div>
          {delivery === 'share' && (
            <p className="text-[11px] text-ink-400">
              Renders first, then opens your device's share sheet — send panels straight to
              Instagram or Photos.
            </p>
          )}
        </section>

        {doc.mode === 'carousel' && (
          <button className="btn-soft w-full text-xs" onClick={() => openSheet('captions')}>
            Edit per-panel captions…
          </button>
        )}

        {target === 'video' ? (
          <button className="btn-primary w-full" disabled={recording !== null} onClick={() => void runVideo()}>
            {recording !== null
              ? `Recording… ${Math.round(recording * 100)}%`
              : '⏺ Record panorama video'}
          </button>
        ) : delivery === 'share' ? (
          prepared ? (
            <button className="btn-primary w-full" onClick={shareNow}>
              📤 Share {prepared.length} file(s) now
            </button>
          ) : (
            <button className="btn-primary w-full" disabled={!!progress} onClick={() => void prepareShare()}>
              {progress ? `Rendering ${progress.done}/${progress.total}…` : 'Render for sharing'}
            </button>
          )
        ) : (
          <button className="btn-primary w-full" disabled={!!progress} onClick={() => void run()}>
            {progress ? `Rendering ${progress.done}/${progress.total}…` : 'Export'}
          </button>
        )}
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
