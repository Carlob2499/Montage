// ---------------------------------------------------------------------------
// High-fidelity template thumbnails: render each template through the REAL
// export renderer (backgrounds incl. multi-stop gradients, glass cards, torn/
// tape/polaroid frames, letter-spaced text with the bundled fonts) instead of
// gray schematic blocks. Empty photo cells are filled with vibrant gradient
// placeholders so templates read as designed, colorful compositions.
//
// Results are cached per template id and rendered lazily (on first view).
// ---------------------------------------------------------------------------

import type { ProjectDoc, TemplateDef } from '../types';
import { PANEL_HEIGHTS, PANEL_WIDTH } from '../types';
import { buildTemplateLayers } from '../components/editor/canvasActions';
import { renderRegion } from './renderer';
import type { RenderResources } from './renderer';
import { makeCanvas, canvasToBlob } from './imageUtils';

const THUMB_TARGET_W = 480;

// soft, on-trend gradient placeholders for empty cells (varied so multi-cell
// layouts look lively rather than uniform)
const PLACEHOLDER_GRADIENTS: [string, string][] = [
  ['#fbc2eb', '#a6c1ee'],
  ['#a1c4fd', '#c2e9fb'],
  ['#ffd3a5', '#fd6585'],
  ['#84fab0', '#8fd3f4'],
  ['#f6d365', '#fda085'],
  ['#d4a5ff', '#5b6cff'],
  ['#f5f7fa', '#c3cfe2'],
  ['#fccb90', '#d57eeb'],
];

let placeholderBitmaps: ImageBitmap[] | null = null;
async function getPlaceholders(): Promise<ImageBitmap[]> {
  if (placeholderBitmaps) return placeholderBitmaps;
  const size = 400;
  const bitmaps = await Promise.all(
    PLACEHOLDER_GRADIENTS.map(async ([from, to], i) => {
      const { canvas, ctx } = makeCanvas(size, size);
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, from);
      g.addColorStop(1, to);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      // a soft highlight blob for depth
      const r = ctx.createRadialGradient(size * 0.3, size * 0.28, 0, size * 0.3, size * 0.28, size * 0.6);
      r.addColorStop(0, 'rgba(255,255,255,0.35)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, size, size);
      return createImageBitmap(canvas as CanvasImageSource, {
        // vary nothing; index kept for clarity
      }).then((b) => ({ b, i }));
    }),
  );
  placeholderBitmaps = bitmaps.sort((a, b) => a.i - b.i).map((x) => x.b);
  return placeholderBitmaps;
}

const cache = new Map<string, string>();

/** Render (or return cached) a thumbnail object URL for a template. */
export async function templateThumbnail(template: TemplateDef): Promise<string> {
  const cached = cache.get(template.id);
  if (cached) return cached;

  const aspect = template.aspect === 'any' ? '4:5' : template.aspect;
  const panelHeight = PANEL_HEIGHTS[aspect] ?? 1350;
  const panelCount = Math.max(1, template.panels);
  const fullW = panelCount * PANEL_WIDTH;
  const fullH = panelHeight;

  const placeholders = await getPlaceholders();
  let counter = 0;
  const makeId = () => `t${counter++}`;
  // give each photo cell a placeholder photoId, cycling the gradient set
  const layers = buildTemplateLayers(
    template,
    { width: fullW, height: fullH },
    makeId,
    (i) => `__ph${i % placeholders.length}`,
  );

  // Cast: panelWidth/panelHeight are added by the geometry refactor; the
  // geometry resolver falls back to aspect→PANEL_HEIGHTS when they're absent,
  // so this synthetic doc renders correctly before and after that change.
  const doc = {
    id: `preview-${template.id}`,
    name: template.name,
    mode: 'carousel',
    aspect,
    panelWidth: PANEL_WIDTH,
    panelHeight,
    panelCount,
    background: template.background ?? { kind: 'solid', color: '#f4f4f5' },
    layers,
    captions: [],
    gutter: 0,
    margin: 0,
    createdAt: 0,
    updatedAt: 0,
  } as unknown as ProjectDoc;

  const photos: RenderResources['photos'] = new Map();
  placeholders.forEach((bitmap, i) => photos.set(`__ph${i}`, { bitmap }));
  const resources: RenderResources = { photos, stickers: new Map() };

  const scale = THUMB_TARGET_W / fullW;
  const canvas = renderRegion(doc, { x: 0, y: 0, width: fullW, height: fullH }, resources, scale);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
  const url = URL.createObjectURL(blob);
  cache.set(template.id, url);
  return url;
}
