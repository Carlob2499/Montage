// ---------------------------------------------------------------------------
// Procedural soundtrack (offline, no licensing, no bundle weight): synthesize a
// subtle vibe-matched bed — a soft sustained pad chord + a gentle kick pulse on
// every beat — via OfflineAudioContext, rendered to an AudioBuffer the reel
// exporter muxes in and the player previews. Every reel gets music by default;
// the user can override with their own track. Browser-only (WebAudio).
// ---------------------------------------------------------------------------

import type { VibeLabel } from '../../types';
import { vibeBeatGrid } from './beats';

interface VibeSound {
  /** chord root in Hz */
  rootHz: number;
  /** chord intervals in semitones above the root */
  chord: number[];
  padType: OscillatorType;
  /** kick fundamental in Hz */
  kickHz: number;
  /** pad level (0..1) — moodier vibes sit quieter */
  padGain: number;
}

function vibeSound(vibe: VibeLabel): VibeSound {
  switch (vibe) {
    case 'moody':
      return { rootHz: 110.0, chord: [0, 3, 7, 10], padType: 'sine', kickHz: 52, padGain: 0.1 };
    case 'muted':
      return { rootHz: 130.81, chord: [0, 3, 7], padType: 'triangle', kickHz: 60, padGain: 0.09 };
    case 'sunwashed':
      return { rootHz: 146.83, chord: [0, 4, 7, 11], padType: 'triangle', kickHz: 66, padGain: 0.1 };
    case 'mono':
      return { rootHz: 123.47, chord: [0, 7, 12], padType: 'sine', kickHz: 58, padGain: 0.08 };
    case 'vibrant':
      return { rootHz: 164.81, chord: [0, 4, 7, 14], padType: 'sawtooth', kickHz: 74, padGain: 0.07 };
  }
}

type OfflineCtor = typeof OfflineAudioContext;

/**
 * Render a `durationMs` vibe bed to an AudioBuffer. Kicks land on the vibe beat
 * grid (the same grid the slides are cut to, so audio + cuts agree). 1s fade in
 * and ~1.2s fade out. Returns null if WebAudio is unavailable.
 */
export async function renderVibeBed(
  vibe: VibeLabel,
  durationMs: number,
): Promise<AudioBuffer | null> {
  const Ctor: OfflineCtor | undefined =
    (typeof OfflineAudioContext !== 'undefined' && OfflineAudioContext) ||
    (typeof window !== 'undefined' &&
      (window as unknown as { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext) ||
    undefined;
  if (!Ctor) return null;

  const sr = 44100;
  const dur = Math.max(0.5, durationMs / 1000);
  const len = Math.ceil(dur * sr);
  const ctx = new Ctor(2, len, sr);
  const s = vibeSound(vibe);

  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(1, 1.0);
  const fadeStart = Math.max(1.0, dur - 1.2);
  master.gain.setValueAtTime(1, fadeStart);
  master.gain.linearRampToValueAtTime(0, dur);

  // pad chord through a gentle low-pass so it stays soft under the visuals
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1200;
  const pad = ctx.createGain();
  pad.gain.value = s.padGain;
  lp.connect(pad);
  pad.connect(master);
  s.chord.forEach((semi, i) => {
    const o = ctx.createOscillator();
    o.type = s.padType;
    o.frequency.value = s.rootHz * Math.pow(2, semi / 12);
    o.detune.value = (i - 1) * 4; // slight spread for warmth
    const g = ctx.createGain();
    g.gain.value = 1 / s.chord.length;
    o.connect(g);
    g.connect(lp);
    o.start(0);
    o.stop(dur);
  });

  // kick pulse on every beat
  const beats = vibeBeatGrid(vibe, durationMs).beatsMs;
  for (const bMs of beats) {
    const t = bMs / 1000;
    if (t >= dur - 0.05) break;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(s.kickHz * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(s.kickHz, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.24);
  }

  return ctx.startRendering();
}

/**
 * Decode a user-supplied audio File to a mono Float32Array + sample rate for
 * beat detection, and the full AudioBuffer for playback. Browser-only.
 */
export async function decodeAudioFile(
  file: Blob,
): Promise<{ buffer: AudioBuffer; mono: Float32Array; sampleRate: number } | null> {
  const AC: typeof AudioContext | undefined =
    (typeof AudioContext !== 'undefined' && AudioContext) ||
    (typeof window !== 'undefined' &&
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) ||
    undefined;
  if (!AC) return null;
  const ctx = new AC();
  try {
    const arr = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arr);
    const mono = buffer.getChannelData(0).slice();
    return { buffer, mono, sampleRate: buffer.sampleRate };
  } finally {
    void ctx.close();
  }
}
