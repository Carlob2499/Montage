// ---------------------------------------------------------------------------
// Auto Montage: assemble a curated best-of set into a finished montage draft,
// themed to the album's detected vibe. Reuses buildRecapDoc for the layout +
// cover/outro, overriding the background and frame style per vibe. Pure.
// ---------------------------------------------------------------------------

import type { AlbumRecord, Background, FrameStyle, PhotoRecord, VibeLabel } from '../../types';
import { buildRecapDoc } from '../recap';
import type { ProjectDoc } from '../../types';

interface VibeTheme {
  background: Background;
  frameStyle?: FrameStyle;
}

const lin = (angle: number, stops: { color: string; at: number }[]): Background => ({
  kind: 'linear',
  from: stops[0].color,
  to: stops[stops.length - 1].color,
  angle,
  stops,
});

/** background + frame treatment matched to each vibe */
export const VIBE_THEMES: Record<VibeLabel, VibeTheme> = {
  sunwashed: {
    background: lin(155, [
      { color: '#3a1c1c', at: 0 },
      { color: '#c2410c', at: 0.4 },
      { color: '#f59e0b', at: 0.72 },
      { color: '#fde9c8', at: 1 },
    ]),
    frameStyle: 'polaroid',
  },
  moody: {
    background: lin(165, [
      { color: '#0b1020', at: 0 },
      { color: '#1e293b', at: 0.5 },
      { color: '#334155', at: 1 },
    ]),
    frameStyle: 'torn',
  },
  vibrant: {
    background: lin(140, [
      { color: '#2d1b4e', at: 0 },
      { color: '#7c3aed', at: 0.4 },
      { color: '#ec4899', at: 0.72 },
      { color: '#f9a8d4', at: 1 },
    ]),
    frameStyle: 'tape',
  },
  muted: {
    background: lin(150, [
      { color: '#efeae2', at: 0 },
      { color: '#d8cfc2', at: 0.55 },
      { color: '#b8ab98', at: 1 },
    ]),
    frameStyle: 'polaroid',
  },
  mono: {
    background: lin(160, [
      { color: '#111113', at: 0 },
      { color: '#3f3f46', at: 0.6 },
      { color: '#a1a1aa', at: 1 },
    ]),
    frameStyle: 'torn',
  },
};

/** stable seed from an id string (deterministic layout per album) */
function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Build the montage ProjectDoc from a curated, vibe-labeled set. Caller assigns
 * ids via `makeId` and persists the result (same path as buildRecapDoc).
 */
export function buildAutoMontageDoc(
  album: AlbumRecord,
  picks: PhotoRecord[],
  vibe: VibeLabel,
  makeId: () => string,
): ProjectDoc {
  const theme = VIBE_THEMES[vibe] ?? VIBE_THEMES.muted;
  const doc = buildRecapDoc(album, picks, makeId, {
    background: theme.background,
    frameStyle: theme.frameStyle,
    seed: seedFromId(album.id),
    nameSuffix: ' — montage',
  });
  return { ...doc, templateId: `vibe:${vibe}` };
}
