// ---------------------------------------------------------------------------
// Image decode, HEIC conversion, thumbnail generation, and cover-fit math.
// ---------------------------------------------------------------------------

export const THUMB_SIZE = 320;
export const PROXY_SIZE = 1600; // editing proxy — full-res only at export

const HEIC_TYPES = ['image/heic', 'image/heif'];
const HEIC_EXT = /\.(heic|heif)$/i;

export function isHeic(file: File): boolean {
  return HEIC_TYPES.includes(file.type.toLowerCase()) || HEIC_EXT.test(file.name);
}

/**
 * Decode any supported image file to a Blob the browser can render.
 * HEIC is converted lazily via heic2any (loaded on first use); if the
 * browser can already decode HEIC natively we skip the conversion.
 */
export async function normalizeImageBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  // try native decode first (Safari can do this)
  try {
    const bmp = await createImageBitmap(file);
    bmp.close();
    return file;
  } catch {
    // fall through to conversion
  }
  try {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    return Array.isArray(out) ? out[0] : out;
  } catch (err) {
    throw new Error(
      `Could not decode HEIC file "${file.name}". Convert it to JPEG first (e.g. export from Photos).`,
      { cause: err },
    );
  }
}

/** OffscreenCanvas where available, HTMLCanvasElement fallback (older iOS). */
export function makeCanvas(
  w: number,
  h: number,
): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    return { canvas, ctx: canvas.getContext('2d')! };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')! };
}

/** convertToBlob / toBlob across canvas kinds. */
export async function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas encoding failed'))),
      type,
      quality,
    );
  });
}

/**
 * Decode a blob to an ImageBitmap, applying EXIF orientation so pixels are
 * always upright from here on. Falls back for browsers that reject the
 * options argument (older Safari) — pass `exifOrientation` so the rotation
 * can be applied manually there.
 */
export async function decodeImage(blob: Blob, exifOrientation?: number): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // options unsupported (or decode failed WITH options) — plain decode,
    // then bake the EXIF rotation in manually
    const raw = await createImageBitmap(blob);
    const o = exifOrientation ?? 1;
    if (o <= 1 || o > 8) return raw;
    const rotated = o >= 5; // 5-8 involve a 90° rotation
    const { canvas, ctx } = makeCanvas(rotated ? raw.height : raw.width, rotated ? raw.width : raw.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    switch (o) {
      case 2: ctx.scale(-1, 1); break;
      case 3: ctx.rotate(Math.PI); break;
      case 4: ctx.scale(1, -1); break;
      case 5: ctx.rotate(Math.PI / 2); ctx.scale(1, -1); break;
      case 6: ctx.rotate(Math.PI / 2); break;
      case 7: ctx.rotate(-Math.PI / 2); ctx.scale(1, -1); break;
      case 8: ctx.rotate(-Math.PI / 2); break;
    }
    ctx.drawImage(raw, -raw.width / 2, -raw.height / 2);
    ctx.restore();
    raw.close();
    return createImageBitmap(canvas as CanvasImageSource);
  }
}

/**
 * Downscale to fit within `max` px on the long edge. Alpha-capable sources
 * (PNG/WebP) are re-encoded as PNG so transparency survives — JPEG encoding a
 * transparent canvas turns those pixels black.
 */
export async function makeScaledImage(
  bitmap: ImageBitmap,
  max: number,
  quality = 0.85,
  preserveAlpha = false,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = preserveAlpha
    ? await canvasToBlob(canvas, 'image/png')
    : await canvasToBlob(canvas, 'image/jpeg', quality);
  return { blob, width: w, height: h };
}

/** @deprecated kept as an alias — see makeScaledImage */
export const makeScaledJpeg = makeScaledImage;

/**
 * Cover-fit math: how to draw an image of (iw, ih) inside a frame (fw, fh)
 * with zoom (>=1) and pan offsets (-1..1 of the free travel).
 * Returns the source crop rect in image pixels.
 */
export function coverCrop(
  iw: number,
  ih: number,
  fw: number,
  fh: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(fw / iw, fh / ih) * Math.max(1, zoom);
  const sw = fw / scale;
  const sh = fh / scale;
  const freeX = (iw - sw) / 2;
  const freeY = (ih - sh) / 2;
  const sx = freeX + offsetX * freeX;
  const sy = freeY + offsetY * freeY;
  return { sx, sy, sw, sh };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  // pick the unit AFTER rounding so 1048575 B reads "1.0 MB", not "1024.0 KB"
  const kb = bytes / 1024;
  if (Number(kb.toFixed(1)) < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (Number(mb.toFixed(1)) < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
