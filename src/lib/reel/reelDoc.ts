// ---------------------------------------------------------------------------
// Story Reel model (pure): a reel is a TIMELINE of full-bleed 9:16 slides —
// one photo each, animated with Ken Burns pan/zoom, joined by transitions,
// bookended by a cover title card and an outro. Unlike a carousel ProjectDoc
// (a spatial continuous canvas), a reel is temporal: one photo on screen at a
// time. This file holds the data model + the pure timing/motion math that both
// the in-app player and the exporter share (preview/export parity, over time).
// ---------------------------------------------------------------------------

import type { Background, VibeLabel } from '../../types';
import type { CoverFont, CoverInk } from '../recap';

/** how a slide enters from the previous segment */
export type ReelTransition = 'crossfade' | 'dip' | 'whip';

export const REEL_TRANSITIONS: ReelTransition[] = ['crossfade', 'dip', 'whip'];

/** Ken Burns endpoints, expressed in coverCrop's (zoom, panX, panY) space so
 *  they feed the SAME cover-fit math the stills use. zoom ≥ 1; pan is -1..1 of
 *  the free travel. */
export interface SlideMotion {
  fromZoom: number;
  toZoom: number;
  fromX: number;
  toX: number;
  fromY: number;
  toY: number;
}

export interface ReelSlide {
  photoId: string;
  durationMs: number;
  motion: SlideMotion;
  /** transition INTO this slide (from the previous segment) */
  transition: ReelTransition;
}

export interface ReelDoc {
  id: string;
  name: string;
  /** always 1080×1920 (9:16) for stories/reels */
  width: number;
  height: number;
  vibe: VibeLabel;
  background: Background;
  ink: CoverInk;
  font: CoverFont;
  /** cover */
  title: string;
  subtitle: string;
  /** outro */
  outroPrimary: string;
  outroSecondary: string;
  coverDurationMs: number;
  outroDurationMs: number;
  transitionMs: number;
  slides: ReelSlide[];
  /** whole-reel length in ms (cover + Σ slide + outro; transitions overlap) */
  durationMs: number;
  createdAt: number;
  updatedAt: number;
}

export type SegmentKind = 'cover' | 'slide' | 'outro';

export interface ReelSegment {
  kind: SegmentKind;
  startMs: number;
  durationMs: number;
  /** index into doc.slides (slide segments only; -1 otherwise) */
  slideIndex: number;
  /** transition INTO this segment ('crossfade' for the un-transitioned cover) */
  transition: ReelTransition;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** smoothstep ease — gentle acceleration/deceleration, the Ken Burns feel */
export const easeInOut = (t: number): number => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/**
 * Ordered segments of the reel. Cover, then one segment per slide, then outro.
 * Transitions overlap the tail of the previous segment (they don't extend the
 * total), so start = cumulative sum of durations. Pure + deterministic.
 */
export function buildTimeline(doc: ReelDoc): ReelSegment[] {
  const segs: ReelSegment[] = [];
  let at = 0;
  segs.push({
    kind: 'cover',
    startMs: 0,
    durationMs: doc.coverDurationMs,
    slideIndex: -1,
    transition: 'crossfade',
  });
  at += doc.coverDurationMs;
  doc.slides.forEach((s, i) => {
    segs.push({
      kind: 'slide',
      startMs: at,
      durationMs: s.durationMs,
      slideIndex: i,
      transition: s.transition,
    });
    at += s.durationMs;
  });
  segs.push({
    kind: 'outro',
    startMs: at,
    durationMs: doc.outroDurationMs,
    slideIndex: -1,
    transition: 'crossfade',
  });
  return segs;
}

/** whole-reel length from the timeline (matches doc.durationMs when consistent) */
export function timelineDurationMs(doc: ReelDoc): number {
  return (
    doc.coverDurationMs +
    doc.slides.reduce((s, sl) => s + sl.durationMs, 0) +
    doc.outroDurationMs
  );
}

/** Locate the active segment + local progress (0..1) for an absolute time. */
export function segmentAt(
  segs: ReelSegment[],
  tMs: number,
): { index: number; seg: ReelSegment; localMs: number; localT: number } {
  const total = segs.length ? segs[segs.length - 1].startMs + segs[segs.length - 1].durationMs : 0;
  const t = clamp(tMs, 0, Math.max(0, total - 1));
  let index = segs.findIndex((s) => t < s.startMs + s.durationMs);
  if (index < 0) index = segs.length - 1;
  const seg = segs[index];
  const localMs = t - seg.startMs;
  const localT = seg.durationMs > 0 ? clamp(localMs / seg.durationMs, 0, 1) : 0;
  return { index, seg, localMs, localT };
}

/** Ken Burns state at local progress t (0..1), smoothstep-eased. Pure. */
export function slideMotionAt(
  m: SlideMotion,
  t: number,
): { zoom: number; offX: number; offY: number } {
  const e = easeInOut(t);
  return {
    zoom: Math.max(1, lerp(m.fromZoom, m.toZoom, e)),
    offX: lerp(m.fromX, m.toX, e),
    offY: lerp(m.fromY, m.toY, e),
  };
}

/** deterministic 0..1 from an integer seed + salt (no Math.random) */
export function hashUnit(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const VIBES: VibeLabel[] = ['sunwashed', 'moody', 'vibrant', 'muted', 'mono'];

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

function normMotion(m: unknown): SlideMotion {
  const o = (m ?? {}) as Partial<SlideMotion>;
  return {
    fromZoom: clamp(num(o.fromZoom, 1), 1, 3),
    toZoom: clamp(num(o.toZoom, 1.12), 1, 3),
    fromX: clamp(num(o.fromX, 0), -1, 1),
    toX: clamp(num(o.toX, 0), -1, 1),
    fromY: clamp(num(o.fromY, 0), -1, 1),
    toY: clamp(num(o.toY, 0), -1, 1),
  };
}

/**
 * Coerce an untrusted object (stored/imported) into a valid ReelDoc — mirrors
 * normalizeProjectDoc's contract (invariant #4). Never throws; drops slides
 * without a photoId, clamps every duration, recomputes the total.
 */
export function normalizeReelDoc(input: unknown): ReelDoc {
  const d = (input ?? {}) as Partial<ReelDoc> & Record<string, unknown>;
  const bg =
    d.background && typeof d.background === 'object'
      ? (d.background as Background)
      : ({ kind: 'solid', color: '#111114' } as Background);
  const ink = (d.ink ?? {}) as Partial<CoverInk>;
  const font = (d.font ?? {}) as Partial<CoverFont>;
  const rawSlides = Array.isArray(d.slides) ? d.slides : [];
  const slides: ReelSlide[] = rawSlides
    .map((s): ReelSlide | null => {
      const o = (s ?? {}) as Partial<ReelSlide>;
      if (typeof o.photoId !== 'string' || !o.photoId) return null;
      const transition = REEL_TRANSITIONS.includes(o.transition as ReelTransition)
        ? (o.transition as ReelTransition)
        : 'crossfade';
      return {
        photoId: o.photoId,
        durationMs: clamp(num(o.durationMs, 2100), 300, 12_000),
        motion: normMotion(o.motion),
        transition,
      };
    })
    .filter((s): s is ReelSlide => s !== null);

  const coverDurationMs = clamp(num(d.coverDurationMs, 2400), 0, 8000);
  const outroDurationMs = clamp(num(d.outroDurationMs, 1900), 0, 8000);
  const vibe = VIBES.includes(d.vibe as VibeLabel) ? (d.vibe as VibeLabel) : 'muted';
  const now = Date.now();

  return {
    id: str(d.id, 'reel'),
    name: str(d.name, 'reel'),
    width: num(d.width, 1080),
    height: num(d.height, 1920),
    vibe,
    background: bg,
    ink: {
      title: str(ink.title, '#fdf6ec'),
      accent: str(ink.accent, '#f0c987'),
      body: str(ink.body, '#fdf6ec'),
    },
    font: {
      title: str(font.title, 'Playfair Display'),
      body: str(font.body, 'Space Grotesk'),
      outro: str(font.outro, 'Caveat'),
    },
    title: str(d.title, ''),
    subtitle: str(d.subtitle, ''),
    outroPrimary: str(d.outroPrimary, 'fin.'),
    outroSecondary: str(d.outroSecondary, ''),
    coverDurationMs,
    outroDurationMs,
    transitionMs: clamp(num(d.transitionMs, 520), 0, 2000),
    slides,
    durationMs: coverDurationMs + slides.reduce((s, sl) => s + sl.durationMs, 0) + outroDurationMs,
    createdAt: num(d.createdAt, now),
    updatedAt: num(d.updatedAt, now),
  };
}

const PAN_LIMIT = 0.55; // keep pans away from the extreme image edge

/**
 * A seeded Ken Burns move for slide `index`. Alternates zoom-in / zoom-out and
 * picks a gentle pan direction, deterministically from (seed, index). Pure —
 * same inputs → same move, so the player and export agree and Shuffle varies it.
 */
export function seededMotion(seed: number, index: number): SlideMotion {
  const base = index * 8;
  const zoomIn = hashUnit(seed, base + 1) < 0.5;
  const amp = 0.1 + hashUnit(seed, base + 2) * 0.06; // 0.10..0.16 zoom travel
  const fromZoom = zoomIn ? 1.0 : 1 + amp;
  const toZoom = zoomIn ? 1 + amp : 1.0;

  const cx = (hashUnit(seed, base + 3) - 0.5) * 0.5; // pan center bias
  const cy = (hashUnit(seed, base + 4) - 0.5) * 0.5;
  const dirX = hashUnit(seed, base + 5) < 0.5 ? -1 : 1;
  const dirY = hashUnit(seed, base + 6) < 0.5 ? -1 : 1;
  const panAmp = 0.16 + hashUnit(seed, base + 7) * 0.08; // 0.16..0.24

  return {
    fromZoom,
    toZoom,
    fromX: clamp(cx - dirX * panAmp, -PAN_LIMIT, PAN_LIMIT),
    toX: clamp(cx + dirX * panAmp, -PAN_LIMIT, PAN_LIMIT),
    fromY: clamp(cy - dirY * panAmp, -PAN_LIMIT, PAN_LIMIT),
    toY: clamp(cy + dirY * panAmp, -PAN_LIMIT, PAN_LIMIT),
  };
}
