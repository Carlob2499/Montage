import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from '../shared/Sheet';
import { db } from '../../db/db';
import { useUIStore } from '../../state/uiStore';
import { useBlobImage } from '../../hooks/useBlobUrl';
import { Slider } from './sheets/TextSheet';
import { FILTER_PRESETS } from '../../lib/presets';
import {
  applyAdjustments,
  applyPresetToStack,
  copyStackForPaste,
  neutralStack,
} from '../../lib/editStack';
import type { Adjustments, CropState, EditStack } from '../../types';

const ADJUSTMENT_DEFS: { key: keyof Adjustments; label: string; min: number; max: number }[] = [
  { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', min: -100, max: 100 },
  { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
];

const CROP_PRESETS: { label: string; ratio: number | null }[] = [
  { label: 'Free', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '16:9', ratio: 16 / 9 },
];

export default function PhotoEditSheet({
  photoId,
  onClose,
}: {
  photoId: string;
  onClose: () => void;
}) {
  const toast = useUIStore((s) => s.toast);
  const copiedStackPhotoId = useUIStore((s) => s.copiedStackPhotoId);
  const record = useLiveQuery(() => db.photos.get(photoId), [photoId]);
  // The result is tagged with the photoId it was queried for: useLiveQuery can
  // briefly return the PREVIOUS photo's value after a dep change, and it returns
  // undefined both while loading and when no row exists.
  const saved = useLiveQuery(
    async () => ({ id: photoId, row: (await db.edits.get(photoId)) ?? null }),
    [photoId],
  );
  // null until the saved stack has loaded — controls are disabled meanwhile so a
  // fast tap can't overwrite existing edits with a neutral stack
  const [stack, setStack] = useState<EditStack | null>(null);
  const [tab, setTab] = useState<'adjust' | 'presets' | 'crop'>('presets');
  const loadedFor = useRef<string | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // reset when the sheet is reused for a different photo
    if (loadedFor.current !== photoId) {
      loadedFor.current = null;
      setStack(null);
    }
    if (saved?.id === photoId && loadedFor.current !== photoId) {
      loadedFor.current = photoId;
      setStack(saved.row ? structuredClone(saved.row.stack) : neutralStack());
    }
  }, [saved, photoId]);

  // flush any pending debounced write when leaving/switching photos
  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [photoId]);

  const persist = (next: EditStack) => {
    setStack(next);
    // debounce the IndexedDB write so slider scrubs don't re-cache the canvas
    // filter (and hit the DB) on every tick
    const id = photoId;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void db.edits.put({ photoId: id, stack: structuredClone(next) });
    }, 150);
  };

  const patchAdj = (key: keyof Adjustments, value: number) => {
    if (!stack) return;
    persist({ ...stack, presetId: undefined, adjustments: { ...stack.adjustments, [key]: value } });
  };

  const copy = () => {
    useUIStore.getState().setCopiedStack(photoId);
    toast('Edit stack copied — open another photo and paste', 'success');
  };

  const paste = async () => {
    if (!copiedStackPhotoId || !stack) return;
    const src = await db.edits.get(copiedStackPhotoId);
    if (!src) return toast('Nothing to paste', 'error');
    persist({ ...copyStackForPaste(src.stack), crop: stack.crop });
    toast('Edits pasted', 'success');
  };

  const pasteToAlbum = async () => {
    if (!record || !stack) return;
    const albumPhotos = await db.photos.where('albumId').equals(record.albumId).toArray();
    const others = albumPhotos.filter((p) => p.id !== photoId && p.kind === 'image');
    if (!others.length) return;
    if (!confirm(`Apply these edits to all ${others.length} other photos in this album?`)) return;
    for (const p of others) {
      const existing = await db.edits.get(p.id);
      await db.edits.put({
        photoId: p.id,
        stack: { ...copyStackForPaste(stack), crop: existing?.stack.crop },
      });
    }
    toast(`Applied to ${others.length} photos`, 'success');
  };

  if (record?.kind === 'video') {
    return (
      <Sheet title={record.fileName} onClose={onClose}>
        <p className="text-sm text-ink-400">
          Video clips can be placed in cells (shown as a poster frame). Adjustments and MP4 panel
          export are coming in a later version — the image pipeline ships first.
        </p>
      </Sheet>
    );
  }

  if (!stack) {
    return (
      <Sheet title={record?.fileName ?? 'Edit photo'} onClose={onClose} tall>
        <p className="py-8 text-center text-sm text-ink-400">Loading edits…</p>
      </Sheet>
    );
  }

  return (
    <Sheet title={record?.fileName ?? 'Edit photo'} onClose={onClose} tall>
      <LivePreview photoId={photoId} stack={stack} />

      <div className="mb-3 mt-3 flex gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
        {(['presets', 'adjust', 'crop'] as const).map((t) => (
          <button
            key={t}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize ${
              tab === t ? 'bg-white shadow dark:bg-ink-700' : 'text-ink-500'
            }`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'adjust' && (
        <div className="space-y-3">
          {ADJUSTMENT_DEFS.map((d) => (
            <Slider
              key={d.key}
              label={d.label}
              min={d.min}
              max={d.max}
              value={stack.adjustments[d.key]}
              onChange={(v) => patchAdj(d.key, v)}
            />
          ))}
        </div>
      )}

      {tab === 'presets' && (
        <div className="grid grid-cols-3 gap-2">
          {FILTER_PRESETS.map((p) => (
            <PresetTile
              key={p.id}
              photoId={photoId}
              name={p.name}
              adjustments={p.adjustments}
              active={stack.presetId === p.id}
              onClick={() => persist(applyPresetToStack(stack, p.adjustments, p.id))}
            />
          ))}
        </div>
      )}

      {tab === 'crop' && (
        <CropControls
          crop={stack.crop}
          imageRatio={record ? record.width / record.height : 1}
          onChange={(crop) => persist({ ...stack, crop })}
        />
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn-soft text-xs" onClick={copy}>
          Copy edits
        </button>
        <button className="btn-soft text-xs" disabled={!copiedStackPhotoId} onClick={() => void paste()}>
          Paste edits
        </button>
        <button className="btn-soft text-xs" onClick={() => void pasteToAlbum()}>
          Apply to whole album
        </button>
        <button
          className="btn-soft text-xs text-red-500"
          onClick={() => persist(neutralStack())}
        >
          Reset all
        </button>
      </div>
    </Sheet>
  );
}

/** Small live preview canvas with the stack applied via the real pixel math. */
function LivePreview({ photoId, stack }: { photoId: string; stack: EditStack }) {
  const img = useBlobImage('thumbs', photoId);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const maxW = 480;
    const crop = stack.crop;
    let sx = 0,
      sy = 0,
      sw = img.width,
      sh = img.height;
    if (crop) {
      sx = crop.x * img.width;
      sy = crop.y * img.height;
      sw = crop.width * img.width;
      sh = crop.height * img.height;
    }
    const rotated = crop && (crop.rotate === 90 || crop.rotate === 270);
    const outW = rotated ? sh : sw;
    const outH = rotated ? sw : sh;
    const scale = Math.min(1, maxW / outW);
    canvas.width = Math.max(1, Math.round(outW * scale));
    canvas.height = Math.max(1, Math.round(outH * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    if (crop) {
      ctx.rotate((crop.rotate * Math.PI) / 180);
      ctx.scale(crop.flipH ? -1 : 1, crop.flipV ? -1 : 1);
    }
    ctx.drawImage(
      img,
      sx,
      sy,
      sw,
      sh,
      (-sw * scale) / 2,
      (-sh * scale) / 2,
      sw * scale,
      sh * scale,
    );
    ctx.restore();
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyAdjustments(data.data, canvas.width, canvas.height, stack.adjustments);
    ctx.putImageData(data, 0, 0);
  }, [img, stack]);

  return (
    <div className="flex justify-center rounded-xl bg-ink-100 p-2 dark:bg-ink-950">
      <canvas ref={canvasRef} className="max-h-56 max-w-full rounded-lg object-contain" />
    </div>
  );
}

function PresetTile({
  photoId,
  name,
  adjustments,
  active,
  onClick,
}: {
  photoId: string;
  name: string;
  adjustments: Adjustments;
  active: boolean;
  onClick: () => void;
}) {
  const img = useBlobImage('thumbs', photoId);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const size = 96;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const s = Math.max(size / img.width, size / img.height);
    ctx.drawImage(
      img,
      (size - img.width * s) / 2,
      (size - img.height * s) / 2,
      img.width * s,
      img.height * s,
    );
    const data = ctx.getImageData(0, 0, size, size);
    applyAdjustments(data.data, size, size, adjustments);
    ctx.putImageData(data, 0, 0);
  }, [img, adjustments]);

  return (
    <button
      className={`overflow-hidden rounded-xl border text-left ${
        active ? 'border-accent-500 ring-2 ring-accent-500' : 'border-ink-200 dark:border-ink-700'
      }`}
      onClick={onClick}
    >
      <canvas ref={canvasRef} className="aspect-square w-full object-cover" />
      <div className="px-2 py-1 text-[11px] font-medium">{name}</div>
    </button>
  );
}

function CropControls({
  crop,
  imageRatio,
  onChange,
}: {
  crop: CropState | undefined;
  imageRatio: number;
  onChange: (c: CropState | undefined) => void;
}) {
  const current: CropState = useMemo(
    () => crop ?? { x: 0, y: 0, width: 1, height: 1, rotate: 0, flipH: false, flipV: false },
    [crop],
  );

  const applyAspect = (ratio: number | null) => {
    if (ratio === null) {
      onChange(crop ? { ...current, x: 0, y: 0, width: 1, height: 1 } : undefined);
      return;
    }
    // Largest centered crop whose OUTPUT (after rotation) has the requested
    // ratio. crop.width/height live in unrotated source space, so for 90/270
    // the source height maps to output width: outRatio = (h·ih)/(w·iw).
    const rotated = current.rotate === 90 || current.rotate === 270;
    let w = 1;
    let h = 1;
    if (rotated) {
      // want h/w = ratio · imageRatio (imageRatio = iw/ih)
      const k = ratio * imageRatio;
      if (k <= 1) h = k;
      else w = 1 / k;
    } else {
      // want w/h = ratio / imageRatio
      const k = ratio / imageRatio;
      if (k <= 1) w = k;
      else h = 1 / k;
    }
    onChange({ ...current, x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h });
  };

  const rotate = () =>
    onChange({ ...current, rotate: (((current.rotate + 90) % 360) as CropState['rotate']) });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {CROP_PRESETS.map((p) => (
          <button key={p.label} className="btn-soft flex-1 px-2 text-xs" onClick={() => applyAspect(p.ratio)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button className="btn-soft text-xs" onClick={rotate}>
          ↻ Rotate 90°
        </button>
        <button
          className="btn-soft text-xs"
          onClick={() => onChange({ ...current, flipH: !current.flipH })}
        >
          ⇄ Flip H
        </button>
        <button
          className="btn-soft text-xs"
          onClick={() => onChange({ ...current, flipV: !current.flipV })}
        >
          ⇅ Flip V
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Slider
          label="Crop X"
          min={0}
          max={Math.max(0, 1 - current.width)}
          step={0.01}
          value={current.x}
          onChange={(v) => onChange({ ...current, x: v })}
        />
        <Slider
          label="Crop Y"
          min={0}
          max={Math.max(0, 1 - current.height)}
          step={0.01}
          value={current.y}
          onChange={(v) => onChange({ ...current, y: v })}
        />
      </div>
      <button className="btn-soft w-full text-xs" onClick={() => onChange(undefined)}>
        Clear crop
      </button>
      <p className="text-xs text-ink-400">
        EXIF orientation is applied automatically on import. Crops are non-destructive.
      </p>
    </div>
  );
}
