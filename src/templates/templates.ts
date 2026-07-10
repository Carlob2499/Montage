// ---------------------------------------------------------------------------
// Bundled template library — all layouts are original designs expressed as
// JSON-compatible data. Coordinates are fractions of the FULL canvas
// (panels × 1080 wide), so cells can span slice boundaries for seamless
// carousels. Add your own templates in the same shape; they are validated
// by validateTemplateLibrary at load time.
// ---------------------------------------------------------------------------

import type { TemplateDef } from '../types';

/** Cell helper: position within panel `p` of an `n`-panel canvas. */
const inPanel = (
  p: number,
  n: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r?: number,
) => ({
  x: (p + x) / n,
  y,
  w: w / n,
  h,
  ...(r !== undefined ? { r } : {}),
});

/** Cell helper: spans from panel-fraction start to end across an n-panel canvas. */
const span = (
  startPanelX: number,
  n: number,
  widthPanels: number,
  y: number,
  h: number,
  r?: number,
) => ({
  x: startPanelX / n,
  y,
  w: widthPanels / n,
  h,
  ...(r !== undefined ? { r } : {}),
});

export const TEMPLATES: TemplateDef[] = [
  // ---- travel ------------------------------------------------------------
  {
    id: 'travel-horizon',
    name: 'Horizon Line',
    category: 'travel',
    panels: 3,
    aspect: 'any',
    background: { kind: 'solid', color: '#f4f1ea' },
    cells: [
      span(0, 3, 3, 0.08, 0.55), // one panorama across all three panels
      inPanel(0, 3, 0.08, 0.68, 0.84, 0.26),
      inPanel(1, 3, 0.08, 0.68, 0.84, 0.26),
      inPanel(2, 3, 0.08, 0.68, 0.84, 0.26),
    ],
    texts: [
      { x: 0.03, y: 0.015, text: 'THE JOURNEY', size: 44, weight: 700, letterSpacing: 8 },
    ],
  },
  {
    id: 'travel-postcards',
    name: 'Postcards',
    category: 'travel',
    panels: 4,
    aspect: 'any',
    background: { kind: 'linear', from: '#e8ddcb', to: '#d4c5a9', angle: 90 },
    cells: [
      inPanel(0, 4, 0.06, 0.1, 0.88, 0.62, 12),
      inPanel(1, 4, 0.06, 0.28, 0.88, 0.62, 12),
      inPanel(2, 4, 0.06, 0.1, 0.88, 0.62, 12),
      inPanel(3, 4, 0.06, 0.28, 0.88, 0.62, 12),
    ],
    texts: [
      { x: 0.02, y: 0.86, text: 'wish you were here', size: 52, weight: 400 },
    ],
  },
  {
    id: 'travel-coastline',
    name: 'Coastline',
    category: 'travel',
    panels: 5,
    aspect: 'any',
    background: { kind: 'solid', color: '#0e1b25' },
    cells: [
      span(0, 5, 2.5, 0, 0.7),
      span(2.5, 5, 2.5, 0.3, 0.7),
      inPanel(0, 5, 0.1, 0.75, 0.8, 0.2, 8),
      inPanel(2, 5, 0.1, 0.05, 0.8, 0.2, 8),
      inPanel(4, 5, 0.1, 0.05, 0.8, 0.2, 8),
    ],
  },
  {
    id: 'travel-waypoints',
    name: 'Waypoints',
    category: 'travel',
    panels: 6,
    aspect: 'any',
    background: { kind: 'solid', color: '#ffffff' },
    cells: [
      span(0, 6, 1.5, 0.05, 0.9),
      span(1.6, 6, 0.8, 0.05, 0.42),
      span(1.6, 6, 0.8, 0.53, 0.42),
      span(2.5, 6, 1.5, 0.05, 0.9),
      span(4.1, 6, 0.8, 0.05, 0.42),
      span(4.1, 6, 0.8, 0.53, 0.42),
      span(5, 6, 1, 0.05, 0.9),
    ],
  },
  {
    id: 'travel-open-road',
    name: 'Open Road',
    category: 'travel',
    panels: 8,
    aspect: 'any',
    background: { kind: 'solid', color: '#101014' },
    cells: [
      span(0, 8, 8, 0.18, 0.64), // single ultra-wide strip across 8 panels
    ],
    texts: [
      { x: 0.005, y: 0.05, text: 'ONE ROAD', size: 60, weight: 800, letterSpacing: 12, color: '#ffffff' },
      { x: 0.005, y: 0.88, text: 'swipe →', size: 40, weight: 400, color: '#9ca3af' },
    ],
  },
  // ---- event ----------------------------------------------------------------
  {
    id: 'event-marquee',
    name: 'Marquee',
    category: 'event',
    panels: 3,
    aspect: 'any',
    background: { kind: 'solid', color: '#17121c' },
    cells: [
      inPanel(0, 3, 0.05, 0.3, 0.9, 0.65, 10),
      inPanel(1, 3, 0.05, 0.05, 0.9, 0.65, 10),
      inPanel(2, 3, 0.05, 0.3, 0.9, 0.65, 10),
    ],
    texts: [
      { x: 0.035, y: 0.08, text: 'THE NIGHT', size: 90, weight: 800, color: '#f5e9d0' },
      { x: 0.7, y: 0.82, text: 'in three acts', size: 44, weight: 400, color: '#b7a98c' },
    ],
  },
  {
    id: 'event-timeline',
    name: 'Timeline',
    category: 'event',
    panels: 5,
    aspect: 'any',
    background: { kind: 'linear', from: '#ffffff', to: '#eceef2', angle: 180 },
    cells: [
      inPanel(0, 5, 0.1, 0.12, 0.8, 0.5, 6),
      inPanel(1, 5, 0.1, 0.38, 0.8, 0.5, 6),
      inPanel(2, 5, 0.1, 0.12, 0.8, 0.5, 6),
      inPanel(3, 5, 0.1, 0.38, 0.8, 0.5, 6),
      inPanel(4, 5, 0.1, 0.12, 0.8, 0.5, 6),
    ],
    texts: [
      { x: 0.02, y: 0.93, text: 'start', size: 36 },
      { x: 0.9, y: 0.93, text: 'finish', size: 36 },
    ],
  },
  {
    id: 'event-mosaic-burst',
    name: 'Mosaic Burst',
    category: 'event',
    panels: 2,
    aspect: 'any',
    background: { kind: 'solid', color: '#ffffff' },
    cells: [
      inPanel(0, 2, 0.04, 0.03, 0.6, 0.45),
      inPanel(0, 2, 0.68, 0.03, 0.28, 0.45),
      inPanel(0, 2, 0.04, 0.52, 0.28, 0.45),
      span(0.36, 2, 1.28, 0.52, 0.45), // spans the seam
      inPanel(1, 2, 0.68, 0.03, 0.28, 0.45),
      inPanel(1, 2, 0.04, 0.03, 0.6, 0.45),
    ],
  },
  {
    id: 'event-encore',
    name: 'Encore',
    category: 'event',
    panels: 4,
    aspect: 'any',
    background: { kind: 'radial', from: '#2b2140', to: '#120d1d' },
    cells: [
      span(0, 4, 2, 0.1, 0.8, 16),
      inPanel(2, 4, 0.08, 0.1, 0.84, 0.38, 12),
      inPanel(2, 4, 0.08, 0.52, 0.84, 0.38, 12),
      inPanel(3, 4, 0.08, 0.1, 0.84, 0.8, 12),
    ],
  },
  // ---- editorial ----------------------------------------------------------------
  {
    id: 'edit-broadsheet',
    name: 'Broadsheet',
    category: 'editorial',
    panels: 3,
    aspect: 'any',
    background: { kind: 'solid', color: '#f7f5f0' },
    cells: [
      inPanel(0, 3, 0.08, 0.32, 0.84, 0.56),
      span(1.08, 3, 1.84, 0.08, 0.55),
      inPanel(1, 3, 0.08, 0.68, 0.38, 0.24),
      inPanel(1, 3, 0.54, 0.68, 0.38, 0.24),
      inPanel(2, 3, 0.08, 0.68, 0.84, 0.24),
    ],
    texts: [
      { x: 0.027, y: 0.08, text: 'VOLUME ONE', size: 38, letterSpacing: 10, weight: 600 },
      { x: 0.027, y: 0.13, text: 'A Short Story', size: 96, weight: 800 },
    ],
  },
  {
    id: 'edit-column',
    name: 'Column Story',
    category: 'editorial',
    panels: 4,
    aspect: 'any',
    background: { kind: 'solid', color: '#ffffff' },
    cells: [
      inPanel(0, 4, 0, 0, 1, 1),
      inPanel(1, 4, 0.12, 0.1, 0.76, 0.55),
      inPanel(2, 4, 0, 0, 1, 1),
      inPanel(3, 4, 0.12, 0.35, 0.76, 0.55),
    ],
    texts: [
      { x: 0.28, y: 0.72, text: 'chapter one', size: 44, weight: 400 },
      { x: 0.78, y: 0.15, text: 'chapter two', size: 44, weight: 400 },
    ],
  },
  {
    id: 'edit-pullquote',
    name: 'Pull Quote',
    category: 'editorial',
    panels: 3,
    aspect: 'any',
    background: { kind: 'solid', color: '#101014' },
    cells: [
      inPanel(0, 3, 0, 0, 1, 1),
      inPanel(2, 3, 0, 0, 1, 1),
    ],
    texts: [
      {
        x: 0.37,
        y: 0.35,
        text: '“The best pictures\nare between\nthe pictures.”',
        size: 72,
        weight: 700,
        color: '#f5f5f4',
        align: 'center',
        width: 0.26,
      },
    ],
  },
  {
    id: 'edit-gallery-wall',
    name: 'Gallery Wall',
    category: 'editorial',
    panels: 2,
    aspect: 'any',
    background: { kind: 'solid', color: '#e9e5dd' },
    cells: [
      inPanel(0, 2, 0.08, 0.08, 0.4, 0.36),
      inPanel(0, 2, 0.54, 0.08, 0.38, 0.5),
      inPanel(0, 2, 0.08, 0.5, 0.4, 0.42),
      span(0.54, 2, 0.92, 0.64, 0.28),
      inPanel(1, 2, 0.54, 0.08, 0.38, 0.5),
      inPanel(1, 2, 0.08, 0.08, 0.4, 0.5),
      inPanel(1, 2, 0.54, 0.64, 0.38, 0.28),
    ],
  },
  {
    id: 'edit-lookbook',
    name: 'Lookbook',
    category: 'editorial',
    panels: 6,
    aspect: 'any',
    background: { kind: 'solid', color: '#f5f2ec' },
    cells: [
      inPanel(0, 6, 0.1, 0.15, 0.8, 0.7),
      inPanel(1, 6, 0, 0, 1, 1),
      inPanel(2, 6, 0.1, 0.15, 0.8, 0.7),
      inPanel(3, 6, 0, 0, 1, 1),
      inPanel(4, 6, 0.1, 0.15, 0.8, 0.7),
      inPanel(5, 6, 0, 0, 1, 1),
    ],
    texts: [
      { x: 0.01, y: 0.02, text: 'N°1', size: 64, weight: 300 },
    ],
  },
  // ---- minimal ----------------------------------------------------------------
  {
    id: 'min-solo',
    name: 'Solo Float',
    category: 'minimal',
    panels: 1,
    aspect: 'any',
    background: { kind: 'solid', color: '#fafafa' },
    cells: [{ x: 0.12, y: 0.14, w: 0.76, h: 0.72 }],
  },
  {
    id: 'min-duet',
    name: 'Duet',
    category: 'minimal',
    panels: 2,
    aspect: 'any',
    background: { kind: 'solid', color: '#ffffff' },
    cells: [
      inPanel(0, 2, 0.14, 0.2, 0.72, 0.6),
      inPanel(1, 2, 0.14, 0.2, 0.72, 0.6),
    ],
  },
  {
    id: 'min-triptych',
    name: 'Triptych',
    category: 'minimal',
    panels: 3,
    aspect: 'any',
    background: { kind: 'solid', color: '#f4f4f5' },
    cells: [
      inPanel(0, 3, 0.1, 0.1, 0.84, 0.8),
      inPanel(1, 3, 0.06, 0.1, 0.88, 0.8),
      inPanel(2, 3, 0.06, 0.1, 0.84, 0.8),
    ],
  },
  {
    id: 'min-offset',
    name: 'Offset',
    category: 'minimal',
    panels: 2,
    aspect: 'any',
    background: { kind: 'solid', color: '#101014' },
    cells: [
      span(0.3, 2, 1.4, 0.22, 0.56), // one image floating across the seam
    ],
    texts: [
      { x: 0.02, y: 0.85, text: '·', size: 80, color: '#71717a' },
    ],
  },
  {
    id: 'min-fullbleed',
    name: 'Full Bleed',
    category: 'minimal',
    panels: 4,
    aspect: 'any',
    cells: [span(0, 4, 4, 0, 1)], // edge-to-edge seamless panorama
  },
  {
    id: 'min-band',
    name: 'Thin Band',
    category: 'minimal',
    panels: 3,
    aspect: 'any',
    background: { kind: 'solid', color: '#ffffff' },
    cells: [span(0, 3, 3, 0.36, 0.28)],
    texts: [
      { x: 0.02, y: 0.1, text: 'a quiet sequence', size: 42, weight: 400 },
    ],
  },
  // ---- film-strip ----------------------------------------------------------------
  {
    id: 'film-classic',
    name: 'Contact Strip',
    category: 'film-strip',
    panels: 3,
    aspect: 'any',
    background: { kind: 'solid', color: '#141414' },
    cells: [
      span(0.1, 3, 0.8, 0.3, 0.4, 4),
      span(1.0, 3, 0.8, 0.3, 0.4, 4),
      span(1.9, 3, 0.8, 0.3, 0.4, 4),
    ],
    texts: [
      { x: 0.02, y: 0.14, text: 'K O D E X   4 0 0', size: 30, color: '#e0a930', letterSpacing: 6 },
      { x: 0.75, y: 0.82, text: '▸ 24  ▸ 25  ▸ 26', size: 30, color: '#e0a930' },
    ],
  },
  {
    id: 'film-double-row',
    name: 'Double Row',
    category: 'film-strip',
    panels: 4,
    aspect: 'any',
    background: { kind: 'solid', color: '#1c1917' },
    cells: [
      span(0.05, 4, 1.2, 0.06, 0.42, 4),
      span(1.35, 4, 1.2, 0.06, 0.42, 4),
      span(2.65, 4, 1.2, 0.06, 0.42, 4),
      span(0.7, 4, 1.2, 0.52, 0.42, 4),
      span(2.0, 4, 1.2, 0.52, 0.42, 4),
    ],
  },
  {
    id: 'film-contact-sheet',
    name: 'Proof Sheet',
    category: 'film-strip',
    panels: 2,
    aspect: 'any',
    background: { kind: 'solid', color: '#0c0c0e' },
    cells: [
      inPanel(0, 2, 0.06, 0.06, 0.42, 0.27, 3),
      inPanel(0, 2, 0.52, 0.06, 0.42, 0.27, 3),
      inPanel(0, 2, 0.06, 0.37, 0.42, 0.27, 3),
      inPanel(0, 2, 0.52, 0.37, 0.42, 0.27, 3),
      inPanel(0, 2, 0.06, 0.68, 0.42, 0.27, 3),
      inPanel(0, 2, 0.52, 0.68, 0.42, 0.27, 3),
      span(1.06, 2, 0.88, 0.06, 0.89, 3), // one blown-up pick on panel 2
    ],
    texts: [
      { x: 0.53, y: 0.965, text: 'proofs — roll 07', size: 26, color: '#a1a1aa' },
    ],
  },
  // ---- before-after ----------------------------------------------------------------
  {
    id: 'ba-split',
    name: 'Split Pair',
    category: 'before-after',
    panels: 2,
    aspect: 'any',
    background: { kind: 'solid', color: '#ffffff' },
    cells: [
      inPanel(0, 2, 0.05, 0.12, 0.9, 0.76),
      inPanel(1, 2, 0.05, 0.12, 0.9, 0.76),
    ],
    texts: [
      { x: 0.05, y: 0.03, text: 'BEFORE', size: 48, weight: 700, letterSpacing: 6 },
      { x: 0.55, y: 0.03, text: 'AFTER', size: 48, weight: 700, letterSpacing: 6 },
    ],
  },
  {
    id: 'ba-reveal',
    name: 'The Reveal',
    category: 'before-after',
    panels: 3,
    aspect: 'any',
    background: { kind: 'linear', from: '#e5e7eb', to: '#f9fafb', angle: 90 },
    cells: [
      inPanel(0, 3, 0.08, 0.15, 0.84, 0.7),
      inPanel(1, 3, 0.2, 0.3, 0.6, 0.4),
      inPanel(2, 3, 0.08, 0.15, 0.84, 0.7),
    ],
    texts: [
      { x: 0.42, y: 0.16, text: 'then / now', size: 54, weight: 500, align: 'center', width: 0.16 },
    ],
  },
  {
    id: 'ba-quad',
    name: 'Quad Compare',
    category: 'before-after',
    panels: 2,
    aspect: 'any',
    background: { kind: 'solid', color: '#f4f4f5' },
    cells: [
      inPanel(0, 2, 0.05, 0.05, 0.44, 0.44),
      inPanel(0, 2, 0.51, 0.05, 0.44, 0.44),
      inPanel(0, 2, 0.05, 0.51, 0.44, 0.44),
      inPanel(0, 2, 0.51, 0.51, 0.44, 0.44),
      inPanel(1, 2, 0.05, 0.05, 0.9, 0.9),
    ],
  },
  // ---- extra structured grids (usable in any project) -------------------------
  {
    id: 'min-grid-2x2',
    name: 'Even Quad',
    category: 'minimal',
    panels: 1,
    aspect: 'any',
    background: { kind: 'solid', color: '#ffffff' },
    cells: [
      { x: 0.03, y: 0.03, w: 0.455, h: 0.455 },
      { x: 0.515, y: 0.03, w: 0.455, h: 0.455 },
      { x: 0.03, y: 0.515, w: 0.455, h: 0.455 },
      { x: 0.515, y: 0.515, w: 0.455, h: 0.455 },
    ],
  },
  {
    id: 'edit-nine-up',
    name: 'Nine Up',
    category: 'editorial',
    panels: 1,
    aspect: 'any',
    background: { kind: 'solid', color: '#fafaf9' },
    cells: [0, 1, 2]
      .flatMap((row) =>
        [0, 1, 2].map((col) => ({
          x: 0.025 + col * 0.325,
          y: 0.025 + row * 0.325,
          w: 0.3,
          h: 0.3,
        })),
      ),
  },
  {
    id: 'travel-ticket',
    name: 'Boarding Pass',
    category: 'travel',
    panels: 2,
    aspect: 'any',
    background: { kind: 'solid', color: '#0f2438' },
    cells: [
      inPanel(0, 2, 0.06, 0.08, 0.88, 0.55, 14),
      inPanel(1, 2, 0.06, 0.37, 0.88, 0.55, 14),
    ],
    texts: [
      { x: 0.04, y: 0.72, text: 'DEP → ARR', size: 56, weight: 700, color: '#e8f0f7', letterSpacing: 4 },
      { x: 0.54, y: 0.14, text: 'GATE 22 · SEAT 4A', size: 40, weight: 500, color: '#9db6cc', letterSpacing: 3 },
    ],
  },
  {
    id: 'event-headline',
    name: 'Headliner',
    category: 'event',
    panels: 3,
    aspect: 'any',
    background: { kind: 'solid', color: '#faf7f2' },
    cells: [
      span(0.5, 3, 2, 0.3, 0.65), // wide hero crossing both seams
    ],
    texts: [
      { x: 0.02, y: 0.06, text: 'SAVE\nTHE\nDATE', size: 100, weight: 800, color: '#1c1917' },
      { x: 0.86, y: 0.1, text: '06 · 07 · 26', size: 44, weight: 500 },
    ],
  },
];
