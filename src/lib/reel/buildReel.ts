// ---------------------------------------------------------------------------
// Build a Story Reel from a curated, vibe-labeled pick set — the temporal
// sibling of buildAutoMontageDoc. Pure: takes records in, returns a ReelDoc.
// Reuses the vibe themes (background/ink/font) and the recap stats so the reel
// and the carousel of the SAME montage share a look.
// ---------------------------------------------------------------------------

import type { AlbumRecord, PhotoRecord, VibeLabel } from '../../types';
import { computeRecapStats } from '../recap';
import { VIBE_THEMES } from '../curation/autoMontage';
import { REEL_TRANSITIONS, seededMotion } from './reelDoc';
import type { ReelDoc, ReelSlide } from './reelDoc';

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;

const COVER_MS = 2400;
const OUTRO_MS = 1900;
const TRANSITION_MS = 520;
const MIN_SLIDE_MS = 1500;
const MAX_SLIDE_MS = 3200;
const IDEAL_SLIDE_MS = 2100;

/** duration presets offered in the UI (seconds) */
export const REEL_DURATIONS = [15, 30, 60] as const;
export const DEFAULT_REEL_DURATION = 30;

const clampInt = (v: number, lo: number, hi: number) =>
  Math.round(Math.min(hi, Math.max(lo, v)));

/**
 * How many slides and how long each, to fill `durationSec` with the available
 * picks. Pure. When there aren't enough picks to fill the time at a natural
 * pace, the reel runs shorter rather than dwelling too long on each frame.
 */
export function planReel(
  pickCount: number,
  durationSec: number,
): { slideCount: number; perSlideMs: number; totalMs: number } {
  const budget = Math.max(MIN_SLIDE_MS, Math.round(durationSec * 1000) - COVER_MS - OUTRO_MS);
  const ideal = Math.max(1, Math.round(budget / IDEAL_SLIDE_MS));
  const slideCount = Math.max(1, Math.min(ideal, Math.max(1, pickCount)));
  const perSlideMs = clampInt(budget / slideCount, MIN_SLIDE_MS, MAX_SLIDE_MS);
  const totalMs = COVER_MS + slideCount * perSlideMs + OUTRO_MS;
  return { slideCount, perSlideMs, totalMs };
}

/** stable seed from an id string (deterministic reel per album) */
export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ReelOptions {
  /** vary the motion/transitions (Shuffle); otherwise deterministic per album */
  seed?: number;
  /** target length in seconds (15/30/60) */
  durationSec?: number;
  /** override the cover title (defaults to album name) */
  title?: string;
  /** pre-computed beat cut times in ms (R2); when present, slides snap to them */
  beatCutsMs?: number[];
}

/**
 * Build the ReelDoc. Caller assigns the id via `makeId` and can persist or
 * (more usually) rebuild it on demand from the montage recipe.
 */
export function buildReelDoc(
  album: AlbumRecord,
  picks: PhotoRecord[],
  vibe: VibeLabel,
  makeId: () => string,
  opts: ReelOptions = {},
): ReelDoc {
  const theme = VIBE_THEMES[vibe] ?? VIBE_THEMES.muted;
  const seed = opts.seed ?? seedFromId(album.id);
  const durationSec = opts.durationSec ?? DEFAULT_REEL_DURATION;
  const stats = computeRecapStats(picks);

  const { slideCount, perSlideMs } = planReel(picks.length, durationSec);
  const chosen = picks.slice(0, slideCount);

  const slides: ReelSlide[] = chosen.map((p, i) => ({
    photoId: p.id,
    durationMs: perSlideMs,
    motion: seededMotion(seed, i),
    transition: REEL_TRANSITIONS[(seed + i) % REEL_TRANSITIONS.length],
  }));

  // when the pick set is empty (shouldn't happen — caller guards), still return
  // a valid, playable reel (cover → outro).
  const durationMs = COVER_MS + slides.reduce((s, sl) => s + sl.durationMs, 0) + OUTRO_MS;

  return {
    id: makeId(),
    name: album.name,
    width: REEL_WIDTH,
    height: REEL_HEIGHT,
    vibe,
    background: theme.background,
    ink: theme.ink,
    font: theme.font,
    title: opts.title ?? album.name,
    subtitle: stats.dateRange || 'a reel',
    outroPrimary: 'fin.',
    outroSecondary: `${album.name}${stats.dateRange ? ` · ${stats.dateRange}` : ''}`.trim(),
    coverDurationMs: COVER_MS,
    outroDurationMs: OUTRO_MS,
    transitionMs: TRANSITION_MS,
    slides,
    durationMs,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
