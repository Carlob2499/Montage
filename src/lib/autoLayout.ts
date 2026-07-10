// ---------------------------------------------------------------------------
// Auto-layout engine: turns a batch of photos into a ready-made composition
// in one tap ("photo dump" flow). Pure and seeded — same inputs + seed give
// the same layout, so it's unit-testable and "shuffle" is just a new seed.
// ---------------------------------------------------------------------------

import { PANEL_WIDTH } from '../types';

export interface PhotoDim {
  id: string;
  width: number;
  height: number;
  dateTaken?: number;
}

export interface PlacedPhoto {
  photoId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export type AutoLayoutStyle = 'dump' | 'clean' | 'panorama';

export interface AutoLayoutOptions {
  style: AutoLayoutStyle;
  seed: number;
  margin: number;
  gutter: number;
}

/** distance a photo keeps from slice lines in dump/clean styles */
export const SEAM_SAFE = 48;

/** deterministic PRNG (mulberry32) */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** contain-fit a photo into a box */
function fitInto(
  p: PhotoDim,
  boxW: number,
  boxH: number,
): { width: number; height: number } {
  const s = Math.min(boxW / p.width, boxH / p.height);
  return { width: p.width * s, height: p.height * s };
}

function sortByTime(photos: PhotoDim[]): PhotoDim[] {
  return [...photos].sort(
    (a, b) => (a.dateTaken ?? 0) - (b.dateTaken ?? 0) || a.id.localeCompare(b.id),
  );
}

/** rows×cols grid that fits k items reasonably inside a panel */
function gridFor(k: number): { rows: number; cols: number } {
  if (k <= 1) return { rows: 1, cols: 1 };
  if (k === 2) return { rows: 2, cols: 1 };
  if (k <= 4) return { rows: 2, cols: 2 };
  if (k <= 6) return { rows: 3, cols: 2 };
  return { rows: 3, cols: 3 };
}

/**
 * Generate a layout for `photos` on a carousel canvas.
 * - `dump`: loose scrapbook scatter, per-panel, jitter + slight rotation,
 *   photos never touch slice lines (seam-safe by construction).
 * - `clean`: tidy per-panel grid, no jitter.
 * - `panorama`: one continuous row flowing across all panels edge to edge.
 */
export function autoLayout(
  photos: PhotoDim[],
  canvasHeight: number,
  panelCount: number,
  opts: AutoLayoutOptions,
): PlacedPhoto[] {
  if (photos.length === 0) return [];
  const rand = seededRandom(opts.seed);
  const ordered = sortByTime(photos);

  if (opts.style === 'panorama') {
    return panoramaRow(ordered, canvasHeight, panelCount, opts);
  }

  const placed: PlacedPhoto[] = [];
  const perPanel = Math.ceil(ordered.length / panelCount);
  const jitter = opts.style === 'dump';

  for (let p = 0; p < panelCount; p++) {
    const batch = ordered.slice(p * perPanel, (p + 1) * perPanel);
    if (batch.length === 0) break;
    const { rows, cols } = gridFor(batch.length);
    const innerX = p * PANEL_WIDTH + SEAM_SAFE + opts.margin / 2;
    const innerW = PANEL_WIDTH - 2 * SEAM_SAFE - opts.margin;
    const innerY = opts.margin;
    const innerH = canvasHeight - 2 * opts.margin;
    const cellW = (innerW - (cols - 1) * opts.gutter) / cols;
    const cellH = (innerH - (rows - 1) * opts.gutter) / rows;

    batch.forEach((photo, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      // last row centers its leftovers
      const inRow = Math.min(cols, batch.length - row * cols);
      const rowOffset = ((cols - inRow) * (cellW + opts.gutter)) / 2;
      const fill = jitter ? 0.86 + rand() * 0.08 : 0.97;
      const size = fitInto(photo, cellW * fill, cellH * fill);
      const cellX = innerX + rowOffset + col * (cellW + opts.gutter);
      const cellY = innerY + row * (cellH + opts.gutter);
      let x = cellX + (cellW - size.width) / 2;
      let y = cellY + (cellH - size.height) / 2;
      let rotation = 0;
      if (jitter) {
        const freeX = Math.max(0, cellW - size.width);
        const freeY = Math.max(0, cellH - size.height);
        x = cellX + freeX * rand();
        y = cellY + freeY * rand();
        rotation = (rand() - 0.5) * 8;
      }
      placed.push({ photoId: photo.id, x, y, ...size, rotation });
    });
  }
  return placed;
}

/** One continuous strip across the full canvas — flows through every seam. */
function panoramaRow(
  ordered: PhotoDim[],
  canvasHeight: number,
  panelCount: number,
  opts: AutoLayoutOptions,
): PlacedPhoto[] {
  const canvasW = panelCount * PANEL_WIDTH;
  const rowH = canvasHeight - 2 * opts.margin;
  // widths at common height, then scale everything to fill exactly
  const naturalW = ordered.map((p) => (p.width / p.height) * rowH);
  const totalNatural = naturalW.reduce((a, b) => a + b, 0);
  const targetW = canvasW - 2 * opts.margin - (ordered.length - 1) * opts.gutter;
  const scale = targetW / totalNatural;
  const height = rowH * scale > rowH ? rowH : rowH * scale;
  let x = opts.margin;
  const y = opts.margin + (rowH - height) / 2;
  return ordered.map((p, i) => {
    const width = naturalW[i] * scale;
    const placedPhoto: PlacedPhoto = { photoId: p.id, x, y, width, height, rotation: 0 };
    x += width + opts.gutter;
    return placedPhoto;
  });
}

/** panel count that gives a comfortable density for n photos (≤4 per panel) */
export function suggestedPanelCount(photoCount: number, current: number, max = 20): number {
  return Math.min(max, Math.max(current, Math.ceil(photoCount / 4)));
}
