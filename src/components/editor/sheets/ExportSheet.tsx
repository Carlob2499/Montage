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
import { exportMotionPanels } from '../../../lib/motionExport';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/db';

type Target = 'panels' | 'grid' | 'panorama' | 'video' | 'motion';
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
  const [kenBurns, setKenBurns] = useState(true);
  const [recording, setRecording] = useState<number | null>(null);
  const [motionCap, setMotionCap] = useState(8);
  const [recordingMotion, setRecordingMotion] = useState<number | null>(null);

  // does this doc reference any video clip? (gates the Motion export target)
  const photoIdsKey = doc
    ? doc.layers
        .filter((l) => l.type === 'photo' && l.photoId)
        .map((l) => (l as { photoId: string }).photoId)
        .join(',')
    : '';
  const hasVideo =
    useLiveQuery(async () => {
      const ids = photoIdsKey ? photoIdsKey.split(',') : [];
      if (!ids.length) return false;
      const rows = await db.photos.bulkGet(ids);
      return rows.some((r) => r?.kind === 'video');
    }, [photoIdsKey]) ?? false;

  if (!doc) return null;

  const isVideoish = target === 'video' || target === 'motion';

  const runMotion = async () => {
    await useProjectStore.getState().save();
    setRecordingMotion(0);
    try {
      const files = await exportMotionPanels(doc, {
        capSec: motionCap,
        onProgress: (f) => setRecordingMotion(f),
      });
      const zip = await bundleZip(doc, files);
      downloadBlob(zip, `${slug(doc.name)}-motion.zip`);
      toast(`Exported ${files.length} panel(s) ✓`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : 'Motion export failed', 'error');
    } finally {
      setRecordingMotion(null);
    }
  };

  const runVideo = async () => {
    await useProjectStore.getState().save();
    setRecording(0);
    try {
      const file = await exportPanoramaVideo(doc, {
        durationSec: videoDuration,
        kenBurns,
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
              {videoExportSupported() && hasVideo && (
                <TargetRow
                  active={target === 'motion'}
                  title="Motion panels (video)"
                  subtitle="Panels with clips export as MP4/WebM; stills stay JPG"
                  onClick={() => {
                    setTarget('motion');
                    setPrepared(null);
                  }}
                />
              )}
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
            <label className="flex items-center justify-between text-sm">
              <span className="text-ink-500">Ken Burns zoom</span>
              <button
                role="switch"
                aria-checked={kenBurns}
                onClick={() => setKenBurns((v) => !v)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  kenBurns ? 'bg-accent-500' : 'bg-ink-300 dark:bg-ink-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    kenBurns ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
            <p className="text-[11px] text-ink-400">
              Records in real time (≈{videoDuration + 2}s) at {doc.panelWidth}×{doc.panelHeight},
              WebM/MP4 depending on the browser.
            </p>
          </section>
        )}

        {target === 'motion' && (
          <section className="space-y-2">
            <Slider label="Max clip length (s)" min={2} max={10} value={motionCap} onChange={setMotionCap} />
            <p className="text-[11px] text-ink-400">
              Each video panel records in real time (up to {motionCap}s); still panels export as
              JPG. Bundled as a ZIP with your captions.
            </p>
          </section>
        )}

        <section className={`space-y-2 ${isVideoish ? 'hidden' : ''}`}>
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

        <section className={`space-y-2 ${isVideoish ? 'hidden' : ''}`}>
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
        ) : target === 'motion' ? (
          <button
            className="btn-primary w-full"
            disabled={recordingMotion !== null}
            onClick={() => void runMotion()}
          >
            {recordingMotion !== null
              ? `Recording… ${Math.round(recordingMotion * 100)}%`
              : '⏺ Export motion panels'}
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
          Full-resolution originals are used — on-screen proxies never touch the export. Motion
          panels record in real time; codec (MP4/WebM) depends on your browser.
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
