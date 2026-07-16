import { describe, it, expect } from 'vitest';
import {
  buildTimeline,
  timelineDurationMs,
  segmentAt,
  slideMotionAt,
  seededMotion,
  normalizeReelDoc,
  easeInOut,
  lerp,
} from './reelDoc';
import { buildReelDoc, planReel, REEL_DURATIONS } from './buildReel';
import type { AlbumRecord, PhotoRecord, VibeLabel } from '../../types';

const album: AlbumRecord = { id: 'alb-reel', name: 'Lisbon', createdAt: 1, sortMode: 'dateTaken' };

let n = 0;
const photo = (over: Partial<PhotoRecord> = {}): PhotoRecord => ({
  id: `p${n++}`,
  albumId: album.id,
  fileName: 'x.jpg',
  mimeType: 'image/jpeg',
  byteSize: 1000,
  width: 1200,
  height: 900,
  dateTaken: n * 86_400_000,
  dateAdded: n,
  tags: [],
  order: n,
  kind: 'image',
  ...over,
});

let idc = 0;
const makeId = () => `id${idc++}`;

describe('math primitives', () => {
  it('lerp + easeInOut hit their endpoints', () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 1)).toBe(10);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
    // clamps out-of-range input
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
  });
});

describe('slideMotionAt', () => {
  const m = seededMotion(123, 0);
  it('returns the start window at t=0 and the end window at t=1', () => {
    const a = slideMotionAt(m, 0);
    const b = slideMotionAt(m, 1);
    expect(a.zoom).toBeCloseTo(Math.max(1, m.fromZoom), 5);
    expect(a.offX).toBeCloseTo(m.fromX, 5);
    expect(b.zoom).toBeCloseTo(Math.max(1, m.toZoom), 5);
    expect(b.offX).toBeCloseTo(m.toX, 5);
  });
  it('keeps zoom ≥ 1 throughout (coverCrop requirement)', () => {
    for (let t = 0; t <= 1.0001; t += 0.1) expect(slideMotionAt(m, t).zoom).toBeGreaterThanOrEqual(1);
  });
  it('actually moves — start and end differ (Ken Burns is not static)', () => {
    const a = slideMotionAt(m, 0);
    const b = slideMotionAt(m, 1);
    const moved = Math.abs(a.zoom - b.zoom) + Math.abs(a.offX - b.offX) + Math.abs(a.offY - b.offY);
    expect(moved).toBeGreaterThan(0.05);
  });
});

describe('seededMotion', () => {
  it('is deterministic for the same (seed,index)', () => {
    expect(seededMotion(42, 3)).toEqual(seededMotion(42, 3));
  });
  it('varies across index and seed', () => {
    expect(seededMotion(42, 0)).not.toEqual(seededMotion(42, 1));
    expect(seededMotion(1, 0)).not.toEqual(seededMotion(2, 0));
  });
  it('keeps pans within safe bounds and zoom ≥ 1', () => {
    for (let s = 0; s < 20; s++) {
      for (let i = 0; i < 8; i++) {
        const m = seededMotion(s * 97 + 1, i);
        for (const v of [m.fromX, m.toX, m.fromY, m.toY]) {
          expect(v).toBeGreaterThanOrEqual(-0.6);
          expect(v).toBeLessThanOrEqual(0.6);
        }
        expect(Math.min(m.fromZoom, m.toZoom)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('planReel', () => {
  it('gives longer reels more slides (bounded by pace)', () => {
    const short = planReel(20, 15);
    const long = planReel(20, 60);
    expect(long.slideCount).toBeGreaterThan(short.slideCount);
    expect(short.perSlideMs).toBeGreaterThanOrEqual(1500);
    expect(short.perSlideMs).toBeLessThanOrEqual(3200);
  });
  it('never asks for more slides than available picks', () => {
    for (const sec of REEL_DURATIONS) expect(planReel(4, sec).slideCount).toBeLessThanOrEqual(4);
  });
  it('totalMs is cover+slides+outro', () => {
    const { slideCount, perSlideMs, totalMs } = planReel(10, 30);
    expect(totalMs).toBe(2400 + slideCount * perSlideMs + 1900);
  });
});

describe('buildReelDoc', () => {
  const picks = Array.from({ length: 8 }, () => photo());

  it('produces a valid, playable reel that survives normalization', () => {
    const doc = buildReelDoc(album, picks, 'vibrant', makeId, { durationSec: 30 });
    expect(doc.width).toBe(1080);
    expect(doc.height).toBe(1920);
    expect(doc.slides.length).toBeGreaterThanOrEqual(1);
    expect(doc.durationMs).toBe(timelineDurationMs(doc));
    const norm = normalizeReelDoc(JSON.parse(JSON.stringify(doc)));
    expect(norm.slides.length).toBe(doc.slides.length);
    expect(norm.durationMs).toBe(doc.durationMs);
  });

  it('themes ink/font/background per vibe', () => {
    for (const vibe of ['sunwashed', 'moody', 'vibrant', 'muted', 'mono'] as VibeLabel[]) {
      const doc = buildReelDoc(album, picks, vibe, makeId);
      expect(doc.vibe).toBe(vibe);
      expect(doc.ink.title).toMatch(/^#/);
      expect(doc.font.title.length).toBeGreaterThan(0);
    }
  });

  it('a fresh seed varies the motion (Shuffle)', () => {
    const a = buildReelDoc(album, picks, 'vibrant', makeId, { seed: 1 });
    const b = buildReelDoc(album, picks, 'vibrant', makeId, { seed: 2 });
    expect(a.slides[0].motion).not.toEqual(b.slides[0].motion);
  });

  it('is deterministic for the same album + picks + seed', () => {
    const a = buildReelDoc(album, picks, 'moody', makeId, { seed: 7 });
    const b = buildReelDoc(album, picks, 'moody', makeId, { seed: 7 });
    expect(a.slides.map((s) => s.motion)).toEqual(b.slides.map((s) => s.motion));
    expect(a.slides.map((s) => s.transition)).toEqual(b.slides.map((s) => s.transition));
  });
});

describe('buildTimeline / segmentAt', () => {
  const picks = Array.from({ length: 5 }, () => photo());
  const doc = buildReelDoc(album, picks, 'muted', makeId, { durationSec: 30, seed: 9 });

  it('is cover + one-per-slide + outro, contiguous, summing to durationMs', () => {
    const segs = buildTimeline(doc);
    expect(segs.length).toBe(doc.slides.length + 2);
    expect(segs[0].kind).toBe('cover');
    expect(segs[segs.length - 1].kind).toBe('outro');
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].startMs).toBe(segs[i - 1].startMs + segs[i - 1].durationMs);
    }
    const end = segs[segs.length - 1].startMs + segs[segs.length - 1].durationMs;
    expect(end).toBe(doc.durationMs);
  });

  it('locates the right segment for a given time', () => {
    const segs = buildTimeline(doc);
    expect(segmentAt(segs, 0).seg.kind).toBe('cover');
    expect(segmentAt(segs, doc.durationMs - 1).seg.kind).toBe('outro');
    const firstSlide = segs.find((s) => s.kind === 'slide')!;
    expect(segmentAt(segs, firstSlide.startMs + 10).seg.slideIndex).toBe(0);
  });
});

describe('normalizeReelDoc', () => {
  it('drops slides with no photoId, clamps durations, recomputes total', () => {
    const dirty = {
      slides: [
        { photoId: 'a', durationMs: 999999, transition: 'nope', motion: { fromZoom: 0.2 } },
        { durationMs: 2000 }, // no photoId → dropped
        { photoId: 'b', durationMs: -50 },
      ],
      coverDurationMs: 2400,
      outroDurationMs: 1900,
      vibe: 'bogus',
    };
    const norm = normalizeReelDoc(dirty);
    expect(norm.slides.length).toBe(2);
    expect(norm.slides[0].durationMs).toBeLessThanOrEqual(12_000);
    expect(norm.slides[0].motion.fromZoom).toBeGreaterThanOrEqual(1);
    expect(norm.slides[0].transition).toBe('crossfade');
    expect(norm.slides[1].durationMs).toBeGreaterThanOrEqual(300);
    expect(norm.vibe).toBe('muted');
    expect(norm.durationMs).toBe(
      norm.coverDurationMs + norm.slides.reduce((s, sl) => s + sl.durationMs, 0) + norm.outroDurationMs,
    );
  });

  it('never throws on garbage', () => {
    expect(() => normalizeReelDoc(null)).not.toThrow();
    expect(() => normalizeReelDoc({})).not.toThrow();
    expect(() => normalizeReelDoc({ slides: 'x' })).not.toThrow();
  });
});
