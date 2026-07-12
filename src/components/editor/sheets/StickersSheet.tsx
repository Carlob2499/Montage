import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from '../../shared/Sheet';
import { db, uid } from '../../../db/db';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { useBlobUrl } from '../../../hooks/useBlobUrl';
import { canvasSize } from '../../../lib/slicer';
import { decodeImage } from '../../../lib/imageUtils';
import { STICKER_PACKS, emojiSticker } from '../../../lib/stickerPack';
import type { StickerLayer } from '../../../types';

const EMOJI = [
  '✨', '💫', '⭐', '🌟', '💖', '❤️', '🔥', '🌈', '☀️', '🌙',
  '⚡', '💥', '🎉', '🎈', '🥳', '😎', '🥰', '😍', '🤩', '👀',
  '🙌', '👑', '💅', '🦋', '🌸', '🌺', '🌊', '🏝️', '✈️', '📍',
  '📸', '🎬', '🎧', '🍃', '🍹', '🍸', '🧊', '💎', '🕊️', '💌',
];

export default function StickersSheet({ onClose }: { onClose: () => void }) {
  const stickers = useLiveQuery(() => db.stickers.orderBy('dateAdded').reverse().toArray(), []);
  const toast = useUIStore((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'library' | 'emoji'>('library');

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

  const addPack = async (packKey: string) => {
    const pack = STICKER_PACKS.find((p) => p.key === packKey);
    if (!pack) return;
    const existing = new Set((await db.stickers.toArray()).map((s) => s.name));
    let added = 0;
    for (const s of await pack.make()) {
      if (existing.has(s.name)) continue;
      await db.stickers.add({ id: uid(), name: s.name, dateAdded: Date.now(), blob: s.blob });
      added++;
    }
    toast(added ? `Added ${added} sticker(s)` : 'Already added', 'success');
  };

  // generate an emoji sticker, store it, and drop it on the canvas
  const placeEmoji = async (emoji: string) => {
    const doc = useProjectStore.getState().doc;
    if (!doc) return;
    const blob = await emojiSticker(emoji);
    const id = uid();
    await db.stickers.add({ id, name: `Emoji ${emoji}`, dateAdded: Date.now(), blob });
    const { width, height } = canvasSize(doc);
    const w = Math.min(320, width * 0.22);
    const layer: StickerLayer = {
      id: uid(),
      type: 'sticker',
      stickerId: id,
      x: width / 2 - w / 2,
      y: height / 2 - w / 2,
      width: w,
      height: w,
      rotation: 0,
      opacity: 1,
    };
    useProjectStore.getState().addLayer(layer);
    onClose();
  };

  return (
    <Sheet title="Stickers & overlays" onClose={onClose} tall>
      <div className="mb-3 flex gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
        {(['library', 'emoji'] as const).map((t) => (
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

      {tab === 'emoji' ? (
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJI.map((e) => (
            <button
              key={e}
              className="aspect-square rounded-lg text-2xl active:bg-ink-100 dark:active:bg-ink-800"
              onClick={() => void placeEmoji(e)}
            >
              {e}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-2 flex gap-2">
            <button className="btn-soft flex-1 text-xs" onClick={() => fileRef.current?.click()}>
              + Upload PNG / WebP
            </button>
          </div>
          <div className="scrollbar-none mb-3 flex gap-1.5 overflow-x-auto">
            {STICKER_PACKS.map((p) => (
              <button
                key={p.key}
                className="shrink-0 rounded-full bg-ink-100 px-3 py-1.5 text-xs font-medium dark:bg-ink-800"
                onClick={() => void addPack(p.key)}
              >
                {p.label}
              </button>
            ))}
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
              Tap a pack above to generate stickers, add emoji, or upload your own PNGs.
            </p>
          )}
        </>
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
