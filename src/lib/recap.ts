// ---------------------------------------------------------------------------
// Trip recap generator: turns an album into a ready-made recap carousel —
// cover panel with EXIF-derived stats, auto-laid photo panels, closing card.
// Pure: takes records in, returns a ProjectDoc (caller persists it).
// ---------------------------------------------------------------------------

import type {
  AlbumRecord,
  Background,
  FrameStyle,
  PhotoRecord,
  ProjectDoc,
  TextLayer,
} from '../types';
import { PANEL_WIDTH, PANEL_HEIGHTS } from '../types';
import { autoLayout, suggestedPanelCount } from './autoLayout';

/** Optional style overrides so callers (e.g. Auto Montage) can theme the recap. */
/** cover/outro text colors — override for contrast against the vibe background */
export interface CoverInk {
  title: string;
  accent: string;
  body: string;
}
/** cover/outro typefaces */
export interface CoverFont {
  title: string;
  body: string;
  outro: string;
}

export interface RecapOptions {
  background?: Background;
  frameStyle?: FrameStyle;
  /** layout shuffle seed */
  seed?: number;
  /** override the "— recap" name suffix */
  nameSuffix?: string;
  /** cover text colors (default reads on a dark background) */
  coverInk?: CoverInk;
  /** cover typefaces */
  coverFont?: CoverFont;
}

const DEFAULT_INK: CoverInk = { title: '#fdf6ec', accent: '#f0c987', body: '#fdf6ec' };
const DEFAULT_FONT: CoverFont = {
  title: 'Playfair Display',
  body: 'Space Grotesk',
  outro: 'Caveat',
};

/** grammatical count, e.g. 1 photo / 3 photos */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

const DEFAULT_BACKGROUND: Background = {
  kind: 'linear',
  from: '#2d1b4e',
  to: '#fcd9a8',
  angle: 160,
  stops: [
    { color: '#1d1436', at: 0 },
    { color: '#7c3aed', at: 0.45 },
    { color: '#f472b6', at: 0.78 },
    { color: '#fcd9a8', at: 1 },
  ],
};

export interface RecapStats {
  photoCount: number;
  /** distinct calendar days with photos */
  days: number;
  /** human date range, e.g. "Jun 3 – Jun 14 '26" (empty when undated) */
  dateRange: string;
  /** total km along the GPS trail, null when fewer than 2 points */
  distanceKm: number | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function computeRecapStats(photos: PhotoRecord[]): RecapStats {
  const dated = photos
    .map((p) => ({ p, t: p.dateTaken ?? p.dateAdded }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  const dayKeys = new Set(
    dated.map(({ t }) => {
      const d = new Date(t);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );

  let dateRange = '';
  if (dated.length > 0) {
    const first = new Date(dated[0].t);
    const last = new Date(dated[dated.length - 1].t);
    const year = `'${String(last.getFullYear()).slice(2)}`;
    dateRange =
      dayKeys.size <= 1 ? `${fmt(first)} ${year}` : `${fmt(first)} – ${fmt(last)} ${year}`;
  }

  const trail = dated.map(({ p }) => p.gps).filter((g): g is { lat: number; lng: number } => !!g);
  let distanceKm: number | null = null;
  if (trail.length >= 2) {
    distanceKm = 0;
    for (let i = 1; i < trail.length; i++) distanceKm += haversineKm(trail[i - 1], trail[i]);
  }

  return { photoCount: photos.length, days: dayKeys.size, dateRange, distanceKm };
}

/** Build the recap ProjectDoc. Caller assigns ids via the passed factory. */
export function buildRecapDoc(
  album: AlbumRecord,
  photos: PhotoRecord[],
  makeId: () => string,
  opts: RecapOptions = {},
): ProjectDoc {
  const frameStyle = opts.frameStyle ?? 'polaroid';
  const background = opts.background ?? DEFAULT_BACKGROUND;
  const seed = opts.seed ?? 7;
  const ink = opts.coverInk ?? DEFAULT_INK;
  const font = opts.coverFont ?? DEFAULT_FONT;
  const stats = computeRecapStats(photos);
  const aspect = '4:5' as const;
  const height = PANEL_HEIGHTS[aspect];
  const photoPanels = Math.max(1, suggestedPanelCount(photos.length, 1) );
  const panelCount = Math.min(20, photoPanels + 2); // cover + photos + outro
  const usablePanels = panelCount - 2;

  // photos laid out across the middle panels, then shifted right of the cover
  const placed = autoLayout(
    photos.map((p) => ({ id: p.id, width: p.width, height: p.height, dateTaken: p.dateTaken })),
    height,
    usablePanels,
    { style: 'dump', seed, margin: 64, gutter: 28, panelWidth: PANEL_WIDTH },
  );

  const statLines = [
    plural(stats.photoCount, 'photo'),
    stats.days > 1 ? plural(stats.days, 'day') : null,
    stats.distanceKm && stats.distanceKm > 1 ? `${Math.round(stats.distanceKm)} km wandered` : null,
  ].filter(Boolean);

  const cover: TextLayer[] = [
    {
      id: makeId(),
      type: 'text',
      text: album.name,
      x: 90,
      y: height * 0.3,
      rotation: 0,
      opacity: 1,
      fontFamily: font.title,
      fontSize: 128,
      fontWeight: 700,
      letterSpacing: 0,
      lineHeight: 1.05,
      fill: ink.title,
      align: 'left',
      width: PANEL_WIDTH - 180,
    },
    {
      id: makeId(),
      type: 'text',
      text: stats.dateRange || 'a recap',
      x: 90,
      y: height * 0.3 - 90,
      rotation: 0,
      opacity: 0.9,
      fontFamily: font.body,
      fontSize: 44,
      fontWeight: 500,
      letterSpacing: 8,
      lineHeight: 1,
      fill: ink.accent,
      align: 'left',
    },
    {
      id: makeId(),
      type: 'text',
      text: statLines.join('  ·  '),
      x: 90,
      y: height * 0.72,
      rotation: 0,
      opacity: 0.92,
      fontFamily: font.body,
      fontSize: 40,
      fontWeight: 500,
      letterSpacing: 2,
      lineHeight: 1.4,
      fill: ink.body,
      align: 'left',
    },
  ];

  const outroX = (panelCount - 1) * PANEL_WIDTH;
  const outro: TextLayer[] = [
    {
      id: makeId(),
      type: 'text',
      text: 'fin.',
      x: outroX + 90,
      y: height * 0.42,
      rotation: 0,
      opacity: 1,
      fontFamily: font.outro,
      fontSize: 160,
      fontWeight: 600,
      letterSpacing: 0,
      lineHeight: 1,
      fill: ink.title,
      align: 'left',
    },
    {
      id: makeId(),
      type: 'text',
      text: `${album.name} · ${stats.dateRange}`.trim(),
      x: outroX + 90,
      y: height * 0.62,
      rotation: 0,
      opacity: 0.7,
      fontFamily: font.body,
      fontSize: 34,
      fontWeight: 400,
      letterSpacing: 2,
      lineHeight: 1,
      fill: ink.accent,
      align: 'left',
    },
  ];

  return {
    id: makeId(),
    name: `${album.name}${opts.nameSuffix ?? ' — recap'}`,
    mode: 'carousel',
    aspect,
    panelWidth: PANEL_WIDTH,
    panelHeight: height,
    panelCount,
    background,
    layers: [
      ...placed.map((pl) => ({
        id: makeId(),
        type: 'photo' as const,
        photoId: pl.photoId,
        x: pl.x + PANEL_WIDTH, // shift past the cover panel
        y: pl.y,
        width: pl.width,
        height: pl.height,
        rotation: pl.rotation,
        opacity: 1,
        cornerRadius: 0,
        imgScale: 1,
        imgOffsetX: 0,
        imgOffsetY: 0,
        frameStyle,
      })),
      ...cover,
      ...outro,
    ],
    captions: Array.from({ length: panelCount }, (_, i) =>
      i === 0 ? `${album.name} ${stats.dateRange}`.trim() : '',
    ),
    gutter: 28,
    margin: 64,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
