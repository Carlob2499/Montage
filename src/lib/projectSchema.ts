// ---------------------------------------------------------------------------
// Validation + normalization for imported project JSON. Backups are
// hand-editable files, so anything malformed must be repaired or rejected
// here — a bad import must never white-screen the editor later.
// ---------------------------------------------------------------------------

import { PANEL_HEIGHTS, PANEL_WIDTH } from '../types';
import type {
  Background,
  GradientStop,
  Layer,
  LayerShadow,
  LayerStroke,
  MaskShape,
  PanelAspect,
  ProjectDoc,
} from '../types';

function normalizeShadow(raw: unknown): LayerShadow | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.color !== 'string') return undefined;
  return {
    color: s.color,
    blur: Math.max(0, num(s.blur, 12)),
    offsetX: num(s.offsetX, 0),
    offsetY: num(s.offsetY, 6),
  };
}

function normalizeStroke(raw: unknown): LayerStroke | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.color !== 'string') return undefined;
  const width = Math.max(0, num(s.width, 0));
  return width > 0 ? { color: s.color, width } : undefined;
}

const MASK_SHAPES: MaskShape[] = ['circle', 'arch', 'heart', 'blob'];
const asMaskShape = (v: unknown): MaskShape | undefined =>
  MASK_SHAPES.includes(v as MaskShape) ? (v as MaskShape) : undefined;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown, fallback: number): number => (isNum(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

function normalizeStops(raw: unknown): GradientStop[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const stops = raw
    .filter(
      (s): s is { color: string; at: number } =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Record<string, unknown>).color === 'string' &&
        isNum((s as Record<string, unknown>).at),
    )
    .map((s) => ({ color: s.color, at: Math.min(1, Math.max(0, s.at)) }))
    .sort((a, b) => a.at - b.at);
  return stops.length >= 2 ? stops : undefined;
}

function normalizeBackground(raw: unknown): Background {
  const fallback: Background = { kind: 'solid', color: '#ffffff' };
  if (typeof raw !== 'object' || raw === null) return fallback;
  const bg = raw as Record<string, unknown>;
  switch (bg.kind) {
    case 'solid':
      return typeof bg.color === 'string' ? { kind: 'solid', color: bg.color } : fallback;
    case 'linear':
      return typeof bg.from === 'string' && typeof bg.to === 'string'
        ? {
            kind: 'linear',
            from: bg.from,
            to: bg.to,
            angle: num(bg.angle, 135),
            stops: normalizeStops(bg.stops),
          }
        : fallback;
    case 'radial':
      return typeof bg.from === 'string' && typeof bg.to === 'string'
        ? { kind: 'radial', from: bg.from, to: bg.to, stops: normalizeStops(bg.stops) }
        : fallback;
    case 'blurPhoto':
      return typeof bg.photoId === 'string'
        ? { kind: 'blurPhoto', photoId: bg.photoId, blur: num(bg.blur, 40), dim: num(bg.dim, 0.25) }
        : fallback;
    default:
      return fallback;
  }
}

function normalizeLayer(raw: unknown): Layer | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.id !== 'string' || !l.id) return null;
  const base = {
    id: l.id,
    x: num(l.x, 0),
    y: num(l.y, 0),
    rotation: num(l.rotation, 0),
    opacity: Math.min(1, Math.max(0, num(l.opacity, 1))),
    locked: l.locked === true,
    name: typeof l.name === 'string' ? l.name : undefined,
    shadow: normalizeShadow(l.shadow),
  };
  switch (l.type) {
    case 'photo':
      return {
        ...base,
        type: 'photo',
        photoId: str(l.photoId, ''),
        width: Math.max(12, num(l.width, 400)),
        height: Math.max(12, num(l.height, 400)),
        cornerRadius: Math.max(0, num(l.cornerRadius, 0)),
        imgScale: Math.max(1, num(l.imgScale, 1)),
        imgOffsetX: Math.min(1, Math.max(-1, num(l.imgOffsetX, 0))),
        imgOffsetY: Math.min(1, Math.max(-1, num(l.imgOffsetY, 0))),
        isSubject: l.isSubject === true,
        frameStyle:
          l.frameStyle === 'polaroid' || l.frameStyle === 'tape' || l.frameStyle === 'torn'
            ? l.frameStyle
            : undefined,
        maskShape: asMaskShape(l.maskShape),
        stroke: normalizeStroke(l.stroke),
      };
    case 'card':
      return {
        ...base,
        type: 'card',
        width: Math.max(12, num(l.width, 400)),
        height: Math.max(12, num(l.height, 200)),
        cornerRadius: Math.max(0, num(l.cornerRadius, 24)),
        fill: str(l.fill, 'rgba(255,255,255,0.55)'),
        glass: l.glass === true,
        stroke: normalizeStroke(l.stroke),
      };
    case 'text':
      return {
        ...base,
        type: 'text',
        text: str(l.text, ''),
        fontFamily: str(l.fontFamily, 'Inter'),
        fontSize: Math.max(4, num(l.fontSize, 60)),
        fontWeight: num(l.fontWeight, 400),
        letterSpacing: num(l.letterSpacing, 0),
        lineHeight: Math.max(0.5, num(l.lineHeight, 1.15)),
        fill: str(l.fill, '#18181b'),
        align: l.align === 'center' || l.align === 'right' ? l.align : 'left',
        width: isNum(l.width) && l.width > 0 ? l.width : undefined,
      };
    case 'sticker':
      if (typeof l.stickerId !== 'string') return null;
      return {
        ...base,
        type: 'sticker',
        stickerId: l.stickerId,
        width: Math.max(12, num(l.width, 200)),
        height: Math.max(12, num(l.height, 200)),
      };
    default:
      return null;
  }
}

/**
 * Normalize an imported project doc. Throws with a readable message when the
 * input isn't a project at all; repairs anything repairable (dropped invalid
 * layers, defaulted missing fields, clamped ranges).
 */
export function normalizeProjectDoc(raw: unknown): ProjectDoc {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Not a Montage project file');
  }
  const d = raw as Record<string, unknown>;
  if (typeof d.id !== 'string' || !Array.isArray(d.layers)) {
    throw new Error('Not a Montage project file');
  }
  const mode = d.mode === 'grid' ? 'grid' : 'carousel';
  // aspect is now a free-form label; keep grid square
  const aspect: PanelAspect = mode === 'grid' ? '1:1' : str(d.aspect, '4:5');
  // geometry is the source of truth; synthesize for docs saved before it existed
  const panelWidth =
    mode === 'grid' ? 1080 : Math.max(1, Math.round(num(d.panelWidth, PANEL_WIDTH)));
  const panelHeight =
    mode === 'grid'
      ? 1080
      : Math.max(1, Math.round(num(d.panelHeight, PANEL_HEIGHTS[aspect] ?? 1350)));
  const panelCount = Math.min(30, Math.max(1, Math.round(num(d.panelCount, 1))));
  const layers = (d.layers as unknown[]).map(normalizeLayer).filter((l): l is Layer => l !== null);
  const rawCaptions = Array.isArray(d.captions) ? d.captions : [];
  const captions = Array.from({ length: Math.max(panelCount, rawCaptions.length) }, (_, i) =>
    typeof rawCaptions[i] === 'string' ? (rawCaptions[i] as string) : '',
  );
  return {
    id: d.id,
    name: str(d.name, 'Imported project'),
    mode,
    aspect,
    panelWidth,
    panelHeight,
    panelCount,
    background: normalizeBackground(d.background),
    layers,
    captions,
    gutter: Math.max(0, num(d.gutter, 24)),
    margin: Math.max(0, num(d.margin, 48)),
    templateId: typeof d.templateId === 'string' ? d.templateId : undefined,
    createdAt: num(d.createdAt, Date.now()),
    updatedAt: num(d.updatedAt, Date.now()),
  };
}
