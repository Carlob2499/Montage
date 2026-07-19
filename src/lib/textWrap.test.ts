import { describe, it, expect } from 'vitest';
import { wrapWords } from './renderer';

// stub measurer: each character is 10px wide (letterSpacing handled by caller)
const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) as TextMetrics };

describe('wrapWords (export text wrapping — Konva parity)', () => {
  it('wraps on spaces to fit the box width', () => {
    // "aaa"=30, "aaa bbb"=70 → 70>65 wraps
    expect(wrapWords(ctx, 'aaa bbb ccc', 65, 0)).toEqual(['aaa', 'bbb', 'ccc']);
    // wider box keeps two words per line
    expect(wrapWords(ctx, 'aaa bbb ccc', 75, 0)).toEqual(['aaa bbb', 'ccc']);
  });

  it('keeps an over-wide single word on its own line (overflow, like Konva word-wrap)', () => {
    // "supercalifragilistic" is far wider than 50px — it must not be dropped or split
    const lines = wrapWords(ctx, 'hi supercalifragilistic ok', 50, 0);
    expect(lines).toContain('supercalifragilistic');
    // every word survives across the wrapped lines
    expect(lines.join(' ').split(' ').sort()).toEqual(['hi', 'ok', 'supercalifragilistic']);
  });

  it('preserves explicit newlines and blank lines', () => {
    expect(wrapWords(ctx, 'a\n\nb', 1000, 0)).toEqual(['a', '', 'b']);
  });

  it('accounts for letterSpacing when deciding line breaks', () => {
    // "ab cd": base widths 20 each; with 10px letterSpacing "ab cd" = 50 + spacing
    // "ab"(20)+"cd"(20)+space glyph… tight box forces a wrap that a 0-spacing box wouldn't
    const tight = wrapWords(ctx, 'ab cd', 45, 10);
    expect(tight).toEqual(['ab', 'cd']);
    const loose = wrapWords(ctx, 'ab cd', 200, 10);
    expect(loose).toEqual(['ab cd']);
  });

  it('a single line that fits stays one line', () => {
    expect(wrapWords(ctx, 'short title', 1000, 0)).toEqual(['short title']);
  });
});
