// ---------------------------------------------------------------------------
// On-device beat analysis + beat-aligned pacing (pure, tested). No network:
// works on a decoded sample buffer (from OfflineAudioContext) for user music,
// and provides a deterministic vibe tempo grid for the procedural default bed.
// The reel cuts slides on beats so the pacing reads produced, not arbitrary.
// ---------------------------------------------------------------------------

import type { VibeLabel } from '../../types';

export interface BeatGrid {
  bpm: number;
  /** beat onset times in ms from the start */
  beatsMs: number[];
}

/** default tempo per vibe — pacing varies by mood even with no music */
export function vibeTempo(vibe: VibeLabel): number {
  switch (vibe) {
    case 'moody':
      return 76;
    case 'muted':
      return 84;
    case 'sunwashed':
      return 92;
    case 'mono':
      return 104;
    case 'vibrant':
      return 122;
  }
}

/** deterministic beat grid at the vibe tempo, covering [0, durationMs]. Pure. */
export function vibeBeatGrid(vibe: VibeLabel, durationMs: number): BeatGrid {
  const bpm = vibeTempo(vibe);
  const interval = 60000 / bpm;
  const beatsMs: number[] = [];
  for (let t = 0; t <= durationMs; t += interval) beatsMs.push(Math.round(t));
  // include one beat past the end so cuts near the finish can still snap
  beatsMs.push(Math.round((beatsMs.length ? beatsMs.length : 0) * interval));
  return { bpm, beatsMs };
}

const HOP = 512;
const WIN = 1024;

/**
 * Positive energy-flux envelope of a mono signal: RMS energy per hop, then the
 * rectified frame-to-frame increase (onsets). Returned with its frame rate.
 * Pure — operates on a Float32Array of samples.
 */
export function energyFlux(
  samples: Float32Array,
  sampleRate: number,
): { flux: Float32Array; frameRate: number } {
  const frames = Math.max(1, Math.floor((samples.length - WIN) / HOP) + 1);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    let sum = 0;
    for (let i = 0; i < WIN; i++) {
      const s = samples[start + i] || 0;
      sum += s * s;
    }
    energy[f] = Math.sqrt(sum / WIN);
  }
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);
  // normalize
  let max = 0;
  for (let f = 0; f < frames; f++) max = Math.max(max, flux[f]);
  if (max > 0) for (let f = 0; f < frames; f++) flux[f] /= max;
  return { flux, frameRate: sampleRate / HOP };
}

/**
 * Estimate BPM by autocorrelating the flux envelope over lags in [minBpm,
 * maxBpm]. Returns the tempo with the strongest periodicity. Pure.
 */
export function estimateBpm(
  flux: Float32Array,
  frameRate: number,
  minBpm = 70,
  maxBpm = 180,
): number {
  const lagMin = Math.max(1, Math.floor((frameRate * 60) / maxBpm));
  const lagMax = Math.min(flux.length - 1, Math.ceil((frameRate * 60) / minBpm));
  let bestLag = lagMin;
  let best = -Infinity;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let sum = 0;
    for (let i = lag; i < flux.length; i++) sum += flux[i] * flux[i - lag];
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  return (60 * frameRate) / bestLag;
}

/**
 * Full beat analysis of a decoded mono signal: tempo + phase-aligned beat grid.
 * Pure. `durationMs` bounds the returned grid (defaults to the signal length).
 */
export function detectBeats(
  samples: Float32Array,
  sampleRate: number,
  durationMs?: number,
): BeatGrid {
  const total = durationMs ?? (samples.length / sampleRate) * 1000;
  if (samples.length < WIN * 4) {
    // too short to analyze — fall back to a neutral 100 BPM grid
    return { bpm: 100, beatsMs: gridFrom(0, 600, total) };
  }
  const { flux, frameRate } = energyFlux(samples, sampleRate);
  const bpm = estimateBpm(flux, frameRate);
  const intervalFrames = (frameRate * 60) / bpm;
  // phase: the strongest onset within the first beat interval
  let phaseFrame = 0;
  let peak = -Infinity;
  for (let f = 0; f < Math.min(flux.length, Math.ceil(intervalFrames)); f++) {
    if (flux[f] > peak) {
      peak = flux[f];
      phaseFrame = f;
    }
  }
  const phaseMs = (phaseFrame / frameRate) * 1000;
  const intervalMs = 60000 / bpm;
  return { bpm, beatsMs: gridFrom(phaseMs, intervalMs, total) };
}

function gridFrom(phaseMs: number, intervalMs: number, totalMs: number): number[] {
  const out: number[] = [];
  for (let t = phaseMs; t <= totalMs + 1; t += intervalMs) out.push(Math.round(t));
  if (out[0] > 1) out.unshift(0);
  return out;
}

/** nearest beat to `t` within `tol` ms, or null if none is close enough */
export function nearestBeat(t: number, beatsMs: number[], tol: number): number | null {
  let best: number | null = null;
  let bestD = tol;
  for (const b of beatsMs) {
    const d = Math.abs(b - t);
    if (d <= bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/**
 * Snap slide cut boundaries to beats. Given the cover length, a slide count,
 * and a nominal per-slide length, place each cut on the nearest beat (within
 * tolerance) while keeping durations within [minMs, maxMs] and monotonic.
 * Returns the per-slide durations (ms). Pure + deterministic.
 */
export function beatAlignedDurations(
  coverMs: number,
  slideCount: number,
  perSlideMs: number,
  beatsMs: number[],
  opts: { minMs?: number; maxMs?: number } = {},
): number[] {
  const minMs = opts.minMs ?? 900;
  const maxMs = opts.maxMs ?? 4200;
  const tol = perSlideMs * 0.5;
  const durations: number[] = [];
  let cut = coverMs; // absolute time of the previous cut
  for (let i = 0; i < slideCount; i++) {
    const nominal = coverMs + (i + 1) * perSlideMs;
    const snapped = nearestBeat(nominal, beatsMs, tol) ?? nominal;
    let dur = snapped - cut;
    if (dur < minMs) dur = minMs;
    if (dur > maxMs) dur = maxMs;
    durations.push(Math.round(dur));
    cut += dur;
  }
  return durations;
}
