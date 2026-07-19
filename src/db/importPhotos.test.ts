import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { classifyFile, mapPool } from './importPhotos';

describe('classifyFile (iOS-reality file classification)', () => {
  it('accepts iPhone QuickTime videos', () => {
    expect(classifyFile({ name: 'IMG_1870.MOV', type: 'video/quicktime' })).toBe('video');
    expect(classifyFile({ name: 'clip.m4v', type: 'video/x-m4v' })).toBe('video');
  });

  it('accepts standard videos', () => {
    expect(classifyFile({ name: 'a.mp4', type: 'video/mp4' })).toBe('video');
    expect(classifyFile({ name: 'a.webm', type: 'video/webm' })).toBe('video');
  });

  it('accepts any image/* mime type (the decoder is the real gate)', () => {
    expect(classifyFile({ name: 'IMG_1.HEIC', type: 'image/heic' })).toBe('image');
    expect(classifyFile({ name: 'x.jpg', type: 'image/jpeg' })).toBe('image');
    expect(classifyFile({ name: 'x.gif', type: 'image/gif' })).toBe('image');
    expect(classifyFile({ name: 'weird.xyz', type: 'image/x-obscure' })).toBe('image');
  });

  it('classifies by extension when the mime type is empty (iOS picker quirk)', () => {
    expect(classifyFile({ name: 'IMG_2001.HEIC', type: '' })).toBe('image');
    expect(classifyFile({ name: 'IMG_2002.MOV', type: '' })).toBe('video');
    expect(classifyFile({ name: 'photo.jpeg', type: '' })).toBe('image');
  });

  it('rejects genuinely unsupported files', () => {
    expect(classifyFile({ name: 'doc.pdf', type: 'application/pdf' })).toBeNull();
    expect(classifyFile({ name: 'notes.txt', type: '' })).toBeNull();
    expect(classifyFile({ name: 'a.avi', type: 'video/x-msvideo' })).toBeNull();
  });
});

describe('mapPool (bounded-concurrency import runner)', () => {
  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('processes every item and returns results in original index order', async () => {
    const items = [5, 1, 4, 2, 3];
    const out = await mapPool(items, 2, async (n) => {
      await tick(n); // finish out of submission order
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      active++;
      peak = Math.max(peak, active);
      await tick(3);
      active--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('passes the correct index for stable ordering', async () => {
    const seen: number[] = [];
    await mapPool(['a', 'b', 'c'], 4, async (_item, i) => {
      seen.push(i);
    });
    expect(seen.sort()).toEqual([0, 1, 2]);
  });

  it('handles an empty list', async () => {
    expect(await mapPool([], 4, async (x) => x)).toEqual([]);
  });
});
