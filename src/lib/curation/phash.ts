// ---------------------------------------------------------------------------
// Perceptual (average) hash for near-duplicate detection. Pure. An 8×8
// grayscale grid thresholded at its mean → 64 bits → 16 hex chars. Robust to
// re-saves, minor crops, and exposure tweaks; hamming distance measures
// visual similarity.
// ---------------------------------------------------------------------------

import type { Pixels } from './pixels';
import { grayGrid } from './pixels';

const SIZE = 8; // 8×8 = 64 bits

/** 16-hex-char average hash of an image. */
export function pHash(px: Pixels): string {
  const g = grayGrid(px, SIZE);
  let mean = 0;
  for (let i = 0; i < g.length; i++) mean += g[i];
  mean /= g.length;

  let hex = '';
  for (let nibble = 0; nibble < 16; nibble++) {
    let bits = 0;
    for (let b = 0; b < 4; b++) {
      const idx = nibble * 4 + b;
      bits = (bits << 1) | (g[idx] >= mean ? 1 : 0);
    }
    hex += bits.toString(16);
  }
  return hex;
}

const POPCOUNT = Array.from({ length: 16 }, (_, i) =>
  ((i >> 0) & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1),
);

/** Number of differing bits between two equal-length hex hashes (0..64). */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += POPCOUNT[x];
  }
  return dist;
}
