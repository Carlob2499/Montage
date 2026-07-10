import { useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from '../../shared/Sheet';
import { db, uid } from '../../../db/db';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { useBlobUrl } from '../../../hooks/useBlobUrl';
import { canvasSize } from '../../../lib/slicer';
import { decodeImage } from '../../../lib/imageUtils';
import type { StickerLayer } from '../../../types';

export default function StickersSheet({ onClose }: { onClose: () => void }) {
  const stickers = useLiveQuery(() => db.stickers.orderBy('dateAdded').reverse().toArray(), []);
  const toast = useUIStore((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (files: File[]) => {
    for (const file of files) {
      if (file.type !== 'image/png' && file.type !== 'image/webp') {
        toast(`${file.name}: stickers must be PNG (transparent) or WebP`, 'error');
        continue;
      }
      await db.stickers.add({ id: uid(), name: file.name, dateAdded: Date.now(), blob: file });
    }
    toast('Sticker(s) added', 'success');
  };

  const place = async (id: string) => {
    const doc = useProjectStore.getState().doc;
    const row = await db.stickers.get(id);
    if (!doc || !row) return;
    const bmp = await decodeImage(row.blob);
    const { width, height } = canvasSize(doc);
    const w = Math.min(400, width * 0.3);
    const h = (bmp.height / bmp.width) * w;
    bmp.close();
    const layer: StickerLayer = {
      id: uid(),
      type: 'sticker',
      stickerId: id,
      x: width / 2 - w / 2,
      y: height / 2 - h / 2,
      width: w,
      height: h,
      rotation: 0,
      opacity: 1,
    };
    useProjectStore.getState().addLayer(layer);
    onClose();
  };

  const addStarterPack = async () => {
    const { generateStarterPack } = await import('../../../lib/stickerPack');
    const existing = new Set((await db.stickers.toArray()).map((s) => s.name));
    const pack = await generateStarterPack();
    let added = 0;
    for (const s of pack) {
      if (existing.has(s.name)) continue;
      await db.stickers.add({ id: uid(), name: s.name, dateAdded: Date.now(), blob: s.blob });
      added++;
    }
    toast(added ? `Added ${added} starter sticker(s)` : 'Starter pack already added', 'success');
  };

  return (
    <Sheet title="Stickers & overlays" onClose={onClose}>
      <div className="mb-3 flex gap-2">
        <button className="btn-soft flex-1" onClick={() => fileRef.current?.click()}>
          + Upload PNG / WebP
        </button>
        <button className="btn-soft flex-1" onClick={() => void addStarterPack()}>
          ✨ Starter pack
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          // materialize before clearing — FileList is live and empties on reset
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void upload(files);
        }}
      />
      <div className="grid grid-cols-4 gap-2">
        {stickers?.map((s) => (
          <StickerTile key={s.id} id={s.id} name={s.name} onPlace={() => void place(s.id)} />
        ))}
      </div>
      {stickers?.length === 0 && (
        <p className="py-6 text-center text-xs text-ink-400">
          Upload your own graphics — logos, doodles, washi tape, anything with transparency.
        </p>
      )}
    </Sheet>
  );
}

function StickerTile({ id, name, onPlace }: { id: string; name: string; onPlace: () => void }) {
  const url = useBlobUrl('stickers', id);
  return (
    <div className="relative">
      <button
        className="aspect-square w-full rounded-xl bg-[conic-gradient(#eee_90deg,#fff_90deg_180deg,#eee_180deg_270deg,#fff_270deg)] bg-[length:16px_16px] p-1 dark:bg-[conic-gradient(#333_90deg,#222_90deg_180deg,#333_180deg_270deg,#222_270deg)]"
        onClick={onPlace}
        title={name}
      >
        {url && <img src={url} alt={name} className="h-full w-full object-contain" />}
      </button>
      <button
        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white"
        onClick={() => void db.stickers.delete(id)}
      >
        ✕
      </button>
    </div>
  );
}
