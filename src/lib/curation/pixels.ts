// ---------------------------------------------------------------------------
// Shared pixel primitives for on-device curation scoring. Everything here is
// pure and operates on a plain { data, width, height } bag (RGBA, row-major)
// so it's trivially unit-testable without a DOM ImageData.
// ---------------------------------------------------------------------------

export interface Pixels {
  /** RGBA, length = width*height*4 */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Rec. 601 luma of an sRGB triple, 0..255. */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Downsample to a `size`×`size` grayscale grid by box-averaging. */
export function grayGrid(px: Pixels, size: number): Float64Array {
  const out = new Float64Array(size * size);
  const { data, width, height } = px;
  for (let gy = 0; gy < size; gy++) {
    const y0 = Math.floor((gy * height) / size);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / size));
    for (let gx = 0; gx < size; gx++) {
      const x0 = Math.floor((gx * width) / size);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / size));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          sum += luma(data[i], data[i + 1], data[i + 2]);
          n++;
        }
      }
      out[gy * size + gx] = n ? sum / n : 0;
    }
  }
  return out;
}

/** sRGB (0..255) → HSL, each component 0..1 (hue 0..1 == 0..360°). */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** Evenly sample up to `limit` pixels, invoking `fn` with each RGB triple. */
export function samplePixels(
  px: Pixels,
  limit: number,
  fn: (r: number, g: number, b: number) => void,
): number {
  const total = px.width * px.height;
  const step = Math.max(1, Math.floor(total / limit));
  let count = 0;
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    fn(px.data[i], px.data[i + 1], px.data[i + 2]);
    count++;
  }
  return count;
}
