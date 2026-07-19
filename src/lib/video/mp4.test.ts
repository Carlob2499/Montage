import { describe, it, expect } from 'vitest';
import { planarAudioChunks } from './mp4';

describe('planarAudioChunks (AAC muxing prep)', () => {
  it('splits into planar chunks with correct per-chunk timestamps', () => {
    const sr = 48000;
    const left = new Float32Array(2500).map((_, i) => i);
    const right = new Float32Array(2500).map((_, i) => -i);
    const chunks = planarAudioChunks([left, right], sr, 1024);
    // 2500 samples / 1024 → 3 chunks (1024, 1024, 452)
    expect(chunks.map((c) => c.frames)).toEqual([1024, 1024, 452]);
    // timestamps are the chunk's start sample in microseconds
    expect(chunks[0].timestampUs).toBe(0);
    expect(chunks[1].timestampUs).toBe(Math.round((1024 / sr) * 1e6));
    expect(chunks[2].timestampUs).toBe(Math.round((2048 / sr) * 1e6));
  });

  it('lays each chunk out planar: [all ch0][all ch1]', () => {
    const left = Float32Array.from([1, 2, 3]);
    const right = Float32Array.from([4, 5, 6]);
    const [chunk] = planarAudioChunks([left, right], 48000, 1024);
    expect(chunk.frames).toBe(3);
    // planar: first `frames` are ch0, next `frames` are ch1
    expect([...chunk.data]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('handles mono and preserves total sample count across chunks', () => {
    const mono = new Float32Array(3000).fill(0.5);
    const chunks = planarAudioChunks([mono], 44100, 1024);
    const totalFrames = chunks.reduce((n, c) => n + c.frames, 0);
    expect(totalFrames).toBe(3000);
    expect(chunks.every((c) => c.data.length === c.frames)).toBe(true); // 1 channel
  });

  it('returns nothing for empty input', () => {
    expect(planarAudioChunks([], 48000)).toEqual([]);
    expect(planarAudioChunks([new Float32Array(0)], 48000)).toEqual([]);
  });
});
