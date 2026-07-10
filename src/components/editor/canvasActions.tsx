// ---------------------------------------------------------------------------
// High-level editor actions shared between screens (add photos, apply
// templates, fill placeholders).
// ---------------------------------------------------------------------------

import { db, uid } from '../../db/db';
import { useProjectStore } from '../../state/projectStore';
import { canvasSize } from '../../lib/slicer';
import { autoLayout, suggestedPanelCount } from '../../lib/autoLayout';
import type { AutoLayoutStyle } from '../../lib/autoLayout';
import type { CardLayer, PhotoLayer, PhotoRecord, TemplateDef, TextLayer } from '../../types';

type PickerTarget =
  | { kind: 'layer' }
  | { kind: 'fill'; layerId: string }
  | { kind: 'background' };

export function addPhotoLayersToProject(photos: PhotoRecord[], target: PickerTarget): void {
  const store = useProjectStore.getState();
  const doc = store.doc;
  if (!doc) return;

  if (target.kind === 'fill') {
    store.updateLayers([target.layerId], (l) =>
      l.type === 'photo' ? { ...l, photoId: photos[0].id } : l,
    );
    return;
  }

  if (target.kind === 'background') {
    store.setBackground({ kind: 'blurPhoto', photoId: photos[0].id, blur: 40, dim: 0.25 });
    return;
  }

  const { width, height } = canvasSize(doc);
  const layers: PhotoLayer[] = photos.map((p, i) => {
    const targetW = Math.min(720, width * 0.5);
    const scale = targetW / p.width;
    const w = p.width * scale;
    const h = p.height * scale;
    return {
      id: uid(),
      type: 'photo',
      photoId: p.id,
      x: Math.min(width - w - 40, 80 + i * 90),
      y: Math.min(height - h - 40, Math.max(40, height / 2 - h / 2 + i * 40)),
      width: w,
      height: h,
      rotation: 0,
      opacity: 1,
      cornerRadius: 0,
      imgScale: 1,
      imgOffsetX: 0,
      imgOffsetY: 0,
    };
  });
  store.commit((d) => ({ ...d, layers: [...d.layers, ...layers] }));
  store.select(layers.map((l) => l.id));
}

/**
 * Apply a template: resizes the project to the template's panel count (if the
 * template is panel-specific), sets its background, and creates placeholder
 * cells + text layers. Existing layers are kept below the new ones unless
 * `replace` is set.
 */
export function applyTemplate(template: TemplateDef, replace: boolean): void {
  const store = useProjectStore.getState();
  const doc = store.doc;
  if (!doc) return;

  const panelCount = doc.mode === 'grid' ? doc.panelCount : Math.max(template.panels, 1);
  const dims = canvasSize({ ...doc, panelCount });

  const cellLayers: PhotoLayer[] = template.cells.map((c, i) => ({
    id: uid(),
    type: 'photo',
    photoId: '',
    name: `Cell ${i + 1}`,
    x: c.x * dims.width,
    y: c.y * dims.height,
    width: c.w * dims.width,
    height: c.h * dims.height,
    rotation: c.rot ?? 0,
    opacity: 1,
    cornerRadius: c.r ?? 0,
    imgScale: 1,
    imgOffsetX: 0,
    imgOffsetY: 0,
    frameStyle: c.frame,
  }));

  const textLayers: TextLayer[] = (template.texts ?? []).map((t) => ({
    id: uid(),
    type: 'text',
    text: t.text,
    x: t.x * dims.width,
    y: t.y * dims.height,
    rotation: 0,
    opacity: 1,
    fontFamily: 'Inter',
    fontSize: t.size,
    fontWeight: t.weight ?? 600,
    letterSpacing: t.letterSpacing ?? 0,
    lineHeight: 1.15,
    fill: t.color ?? '#18181b',
    align: t.align ?? 'left',
    width: t.width ? t.width * dims.width : undefined,
  }));

  store.commit((d) => ({
    ...d,
    panelCount,
    captions:
      d.mode === 'grid'
        ? d.captions
        : Array.from({ length: panelCount }, (_, i) => d.captions[i] ?? ''),
    background: template.background ?? d.background,
    templateId: template.id,
    layers: replace ? [...cellLayers, ...textLayers] : [...d.layers, ...cellLayers, ...textLayers],
  }));
}

/** Add a plain structured grid of placeholder cells (2–12 cells). */
export function applyStructuredGrid(rows: number, cols: number, spacing: number): void {
  const store = useProjectStore.getState();
  const doc = store.doc;
  if (!doc) return;
  const { width, height } = canvasSize(doc);
  const m = doc.margin;
  const cellW = (width - 2 * m - (cols - 1) * spacing) / cols;
  const cellH = (height - 2 * m - (rows - 1) * spacing) / rows;
  const layers: PhotoLayer[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      layers.push({
        id: uid(),
        type: 'photo',
        photoId: '',
        name: `Cell ${r * cols + c + 1}`,
        x: m + c * (cellW + spacing),
        y: m + r * (cellH + spacing),
        width: cellW,
        height: cellH,
        rotation: 0,
        opacity: 1,
        cornerRadius: 0,
        imgScale: 1,
        imgOffsetX: 0,
        imgOffsetY: 0,
      });
    }
  }
  store.commit((d) => ({ ...d, layers: [...d.layers, ...layers] }));
}

/**
 * One-tap "photo dump": lay a batch of photos out across the panels
 * (seam-safe scatter or seamless panorama), growing the panel count to a
 * comfortable density. Returns the layer ids it created.
 */
export function applyAutoLayout(
  photos: PhotoRecord[],
  style: AutoLayoutStyle,
  seed = Date.now(),
): string[] {
  const store = useProjectStore.getState();
  const doc = store.doc;
  if (!doc || photos.length === 0) return [];
  const panelCount =
    doc.mode === 'grid'
      ? doc.panelCount
      : suggestedPanelCount(photos.length, doc.panelCount);
  const dims = canvasSize({ ...doc, panelCount });
  // grid mode: the 3-column canvas behaves like 3 vertical "panels"
  const horizontalPanels = doc.mode === 'grid' ? 3 : panelCount;
  const placed = autoLayout(
    photos.map((p) => ({ id: p.id, width: p.width, height: p.height, dateTaken: p.dateTaken })),
    dims.height,
    horizontalPanels,
    { style, seed, margin: doc.margin, gutter: doc.gutter },
  );
  const layers: PhotoLayer[] = placed.map((pl) => ({
    id: uid(),
    type: 'photo',
    photoId: pl.photoId,
    x: pl.x,
    y: pl.y,
    width: pl.width,
    height: pl.height,
    rotation: pl.rotation,
    opacity: 1,
    cornerRadius: 0,
    imgScale: 1,
    imgOffsetX: 0,
    imgOffsetY: 0,
  }));
  store.commit((d) => ({
    ...d,
    panelCount,
    captions:
      d.mode === 'grid'
        ? d.captions
        : panelCount <= d.captions.length
          ? d.captions
          : [...d.captions, ...Array.from({ length: panelCount - d.captions.length }, () => '')],
    layers: [...d.layers, ...layers],
  }));
  return layers.map((l) => l.id);
}

/**
 * Re-shuffle: rebuild the layout of the photo layers already on the canvas
 * with a fresh seed (keeps text/sticker/card layers untouched).
 */
export async function reshuffleLayout(style: AutoLayoutStyle): Promise<void> {
  const store = useProjectStore.getState();
  const doc = store.doc;
  if (!doc) return;
  const photoIds = doc.layers
    .filter((l): l is PhotoLayer => l.type === 'photo' && !!l.photoId)
    .map((l) => l.photoId);
  if (photoIds.length === 0) return;
  const photos = (await db.photos.bulkGet(photoIds)).filter(
    (p): p is PhotoRecord => p !== undefined,
  );
  const dims = canvasSize(doc);
  const horizontalPanels = doc.mode === 'grid' ? 3 : doc.panelCount;
  const placed = autoLayout(
    photos.map((p) => ({ id: p.id, width: p.width, height: p.height, dateTaken: p.dateTaken })),
    dims.height,
    horizontalPanels,
    { style, seed: Date.now(), margin: doc.margin, gutter: doc.gutter },
  );
  const byPhoto = new Map(placed.map((pl) => [pl.photoId, pl]));
  store.commit((d) => ({
    ...d,
    layers: d.layers.map((l) => {
      if (l.type !== 'photo' || !l.photoId) return l;
      const pl = byPhoto.get(l.photoId);
      if (!pl) return l;
      return { ...l, x: pl.x, y: pl.y, width: pl.width, height: pl.height, rotation: pl.rotation };
    }),
  }));
}

export function addTextLayer(): void {
  const store = useProjectStore.getState();
  const doc = store.doc;
  if (!doc) return;
  const { width, height } = canvasSize(doc);
  const layer: TextLayer = {
    id: uid(),
    type: 'text',
    text: 'Your text',
    x: width / 2 - 220,
    y: height / 2 - 40,
    rotation: 0,
    opacity: 1,
    fontFamily: 'Inter',
    fontSize: 80,
    fontWeight: 700,
    letterSpacing: 0,
    lineHeight: 1.15,
    fill: '#18181b',
    align: 'left',
  };
  store.addLayer(layer);
}

/** 90s point-and-shoot date stamp in the current panel's corner */
export function addDateStamp(date = new Date()): void {
  const store = useProjectStore.getState();
  const doc = store.doc;
  if (!doc) return;
  const { height } = canvasSize(doc);
  const text = `'${String(date.getFullYear()).slice(2)} ${date.getMonth() + 1} ${date.getDate()}`;
  const layer: TextLayer = {
    id: uid(),
    type: 'text',
    text,
    x: 720,
    y: height - 160,
    rotation: 0,
    opacity: 0.92,
    fontFamily: 'Space Grotesk',
    fontSize: 56,
    fontWeight: 600,
    letterSpacing: 6,
    lineHeight: 1,
    fill: '#ff9a3c',
    align: 'left',
  };
  store.addLayer(layer);
}

/** frosted caption card (glassmorphism) */
export function addCardLayer(glass: boolean): void {
  const store = useProjectStore.getState();
  const doc = store.doc;
  if (!doc) return;
  const { height } = canvasSize(doc);
  const layer: CardLayer = {
    id: uid(),
    type: 'card',
    x: 140,
    y: height / 2 - 160,
    width: 800,
    height: 320,
    rotation: 0,
    opacity: 1,
    cornerRadius: 32,
    fill: glass ? 'rgba(255,255,255,0.28)' : '#ffffff',
    glass,
  };
  store.addLayer(layer);
}
