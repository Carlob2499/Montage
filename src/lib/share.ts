// ---------------------------------------------------------------------------
// Web Share API helpers — hand exported panels straight to the OS share
// sheet (Instagram, Photos, AirDrop…) instead of the downloads folder.
// ---------------------------------------------------------------------------

import type { ExportedFile } from './exporter';

export function toShareFiles(files: ExportedFile[]): File[] {
  return files.map((f) => new File([f.blob], f.name, { type: f.blob.type }));
}

/** Is sharing these files supported here? (Requires HTTPS + user gesture.) */
export function canShareFiles(files: File[]): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files })
  );
}

export function shareSupported(): boolean {
  // probe with a tiny file — canShare validates types synchronously
  try {
    const probe = new File([new Uint8Array(4)], 'probe.png', { type: 'image/png' });
    return canShareFiles([probe]);
  } catch {
    return false;
  }
}

/**
 * Invoke the native share sheet. MUST be called synchronously inside a user
 * gesture — do all rendering beforehand. Returns false when the user
 * cancelled (not an error) and throws only on real failures.
 */
export async function shareFiles(files: File[], title: string): Promise<boolean> {
  try {
    await navigator.share({ files, title });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return false;
    throw err;
  }
}
