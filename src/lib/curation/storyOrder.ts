// ---------------------------------------------------------------------------
// Story-arc ordering (pure, heuristic — no ML): reorder a curated pick set so
// the montage/reel reads like a narrated trip rather than a raw chronological
// dump. Opens on an establishing shot, alternates people/detail through the
// middle, and closes on the warmest "golden" frame. A permutation of the input
// (no pick added or lost). Deterministic (stable id tie-breaks).
// ---------------------------------------------------------------------------

import type { PhotoRecord } from '../../types';

const timeOf = (p: PhotoRecord): number => p.dateTaken ?? p.dateAdded;
const facesOf = (p: PhotoRecord): number => p.faces?.length ?? 0;
const qualityOf = (p: PhotoRecord): number => p.scores?.quality ?? 0.5;

/** 0..1 warmth from mean hue — peaks on oranges/reds (golden hour). Pure. */
export function warmth(p: PhotoRecord): number {
  const s = p.scores;
  if (!s) return 0;
  // triangular distance to orange (~30° = 0.083 on the 0..1 hue wheel), wrapped
  const d = Math.abs(s.hue - 0.083);
  const wrapped = Math.min(d, 1 - d);
  const hueWarm = Math.max(0, 1 - wrapped * 3);
  return hueWarm * (0.4 + 0.6 * s.sat);
}

/** how much a shot reads as an establishing/wide frame (few faces, calm). */
function openness(p: PhotoRecord): number {
  return 1 / (1 + facesOf(p)) - (p.scores ? p.scores.sat * 0.15 : 0);
}

/**
 * Reorder picks into a story arc. Pure + deterministic. With <3 picks the
 * chronological order is returned unchanged.
 */
export function storyOrder(picks: PhotoRecord[]): PhotoRecord[] {
  if (picks.length < 3) return [...picks];

  const byId = (a: PhotoRecord, b: PhotoRecord) => (a.id < b.id ? -1 : 1);

  // finale first: the warmest "golden" shot claims the closing slot before the
  // opener can grab it (a warm, high-quality frame reads best as the ending)
  const finale = [...picks].sort(
    (a, b) => warmth(b) * qualityOf(b) - warmth(a) * qualityOf(a) || byId(a, b),
  )[0];

  // establishing: most "open" shot among what's left, quality as tie-breaker
  const rest0 = picks.filter((p) => p.id !== finale.id);
  const opener = [...rest0].sort(
    (a, b) => openness(b) * qualityOf(b) - openness(a) * qualityOf(a) || byId(a, b),
  )[0];

  const middle = rest0.filter((p) => p.id !== opener.id);

  // alternate people / detail through the middle, each stream chronological, so
  // the rhythm varies instead of clumping all portraits together
  const people = middle.filter((p) => facesOf(p) > 0).sort((a, b) => timeOf(a) - timeOf(b) || byId(a, b));
  const scenes = middle.filter((p) => facesOf(p) === 0).sort((a, b) => timeOf(a) - timeOf(b) || byId(a, b));
  const woven: PhotoRecord[] = [];
  let i = 0;
  let j = 0;
  // lead with whichever stream is larger so it doesn't run dry early
  let takePeople = people.length >= scenes.length;
  while (i < people.length || j < scenes.length) {
    if (takePeople && i < people.length) woven.push(people[i++]);
    else if (!takePeople && j < scenes.length) woven.push(scenes[j++]);
    else if (i < people.length) woven.push(people[i++]);
    else woven.push(scenes[j++]);
    takePeople = !takePeople;
  }

  return [opener, ...woven, finale];
}
