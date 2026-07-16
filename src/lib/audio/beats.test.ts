import { describe, it, expect } from 'vitest';
import {
  vibeTempo,
  vibeBeatGrid,
  detectBeats,
  estimateBpm,
  energyFlux,
  nearestBeat,
  beatAlignedDurations,
} from './beats';

/** synthetic click track: a short impulse every `periodSec` seconds */
function clickTrack(bpm: number, seconds: number, sampleRate = 44100): Float32Array {
  const periodSamples = Math.round((60 / bpm) * sampleRate);
  const buf = new Float32Array(seconds * sampleRate);
  for (let i = 0; i < buf.length; i += periodSamples) {
    // a 4ms decaying click
    for (let k = 0; k < 0.004 * sampleRate && i + k < buf.length; k++) {
      buf[i + k] = Math.exp(-k / 40) * (k % 2 ? -1 : 1);
    }
  }
  return buf;
}

describe('vibe tempo grid', () => {
  it('is faster for vibrant than moody', () => {
    expect(vibeTempo('vibrant')).toBeGreaterThan(vibeTempo('moody'));
  });
  it('produces beats spaced by 60/bpm seconds over the duration', () => {
    const { bpm, beatsMs } = vibeBeatGrid('vibrant', 10000);
    const interval = 60000 / bpm;
    expect(beatsMs[0]).toBe(0);
    expect(beatsMs[1] - beatsMs[0]).toBeCloseTo(interval, 0);
    expect(beatsMs[beatsMs.length - 1]).toBeGreaterThanOrEqual(10000);
  });
});

describe('detectBeats on a synthetic click track', () => {
  it('recovers 120 BPM within tolerance', () => {
    const track = clickTrack(120, 6);
    const { bpm } = detectBeats(track, 44100);
    expect(bpm).toBeGreaterThan(115);
    expect(bpm).toBeLessThan(125);
  });

  it('recovers 90 BPM within tolerance', () => {
    const track = clickTrack(90, 6);
    const { bpm } = detectBeats(track, 44100);
    expect(bpm).toBeGreaterThan(85);
    expect(bpm).toBeLessThan(95);
  });

  it('places beats ~500ms apart for 120 BPM', () => {
    const { beatsMs } = detectBeats(clickTrack(120, 6), 44100);
    const gaps: number[] = [];
    for (let i = 1; i < beatsMs.length; i++) gaps.push(beatsMs[i] - beatsMs[i - 1]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(480);
    expect(mean).toBeLessThan(520);
  });

  it('degrades gracefully on a too-short signal', () => {
    const grid = detectBeats(new Float32Array(100), 44100);
    expect(grid.bpm).toBeGreaterThan(0);
    expect(grid.beatsMs.length).toBeGreaterThan(0);
  });
});

describe('energyFlux', () => {
  it('is rectified (never negative) and normalized to ≤1', () => {
    const { flux } = energyFlux(clickTrack(120, 3), 44100);
    for (const v of flux) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe('estimateBpm bounds', () => {
  it('stays within the searched range', () => {
    const { flux, frameRate } = energyFlux(clickTrack(120, 5), 44100);
    const bpm = estimateBpm(flux, frameRate, 70, 180);
    expect(bpm).toBeGreaterThanOrEqual(70);
    expect(bpm).toBeLessThanOrEqual(180);
  });
});

describe('nearestBeat', () => {
  const beats = [0, 500, 1000, 1500, 2000];
  it('snaps within tolerance', () => {
    expect(nearestBeat(1040, beats, 100)).toBe(1000);
    expect(nearestBeat(1490, beats, 100)).toBe(1500);
  });
  it('returns null beyond tolerance', () => {
    expect(nearestBeat(1250, beats, 100)).toBeNull();
  });
});

describe('beatAlignedDurations', () => {
  it('lands cuts on beats and stays monotonic within clamp', () => {
    // 120 BPM grid → beats every 500ms
    const beats = Array.from({ length: 40 }, (_, i) => i * 500);
    const durs = beatAlignedDurations(2000, 5, 2000, beats, { minMs: 900, maxMs: 4200 });
    expect(durs.length).toBe(5);
    for (const d of durs) {
      expect(d).toBeGreaterThanOrEqual(900);
      expect(d).toBeLessThanOrEqual(4200);
    }
    // cumulative cuts should sit on 500ms beats (since nominal already does)
    let t = 2000;
    for (const d of durs) {
      t += d;
      expect(t % 500).toBe(0);
    }
  });

  it('falls back to nominal when no beat is near', () => {
    const durs = beatAlignedDurations(2000, 3, 2000, [0], { minMs: 900, maxMs: 4200 });
    expect(durs).toEqual([2000, 2000, 2000]);
  });
});
