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

/**
 * Decode a blob to an ImageBitmap, applying EXIF orientation so pixels are
 * always upright from here on.
 */
export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

/** Downscale to fit within `max` px on the long edge; returns a JPEG blob. */
export async function makeScaledJpeg(
  bitmap: ImageBitmap,
  max: number,
  quality = 0.85,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return { blob, width: w, height: h };
}

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
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
