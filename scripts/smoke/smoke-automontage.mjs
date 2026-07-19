// Auto Montage smoke: the flagship one-tap flow. From Home, drop a LARGE photo
// dump into "Auto Montage" → the pipeline (import → score → curate → stitch)
// runs and lands on a finished, swipeable montage in Preview. Proves a big dump
// isn't silently clamped: the "Photos in this montage" control must expose the
// whole imported pool, not a hard-capped 12. Then Shuffle and Export. No native
// dialog may fire.
import { statSync } from 'node:fs';
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const DUMP = 16; // more than the old hard cap of 12

const { browser, page, errors } = await launchPage();
page.on('dialog', (d) => {
  errors.push(`native dialog fired ("${d.message()}")`);
  d.dismiss().catch(() => {});
});

await page.goto(BASE, { waitUntil: 'networkidle' });

// tap the Auto Montage hero and feed it a big, visually-distinct photo dump
await page.waitForSelector('text=Auto Montage', { timeout: 10000 });
await page.evaluate(async (count) => {
  const files = [];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 1000;
    const g = c.getContext('2d');
    // a distinct 4×4 light/dark quadrant pattern per photo (driven by the bits of
    // a mixed seed) gives each image well-separated LOW-FREQUENCY luminance
    // structure → distinct perceptual hashes, so dedup doesn't collapse them
    const seed = (i * 2654435761) >>> 0;
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        const bit = (seed >> (gy * 4 + gx)) & 1;
        g.fillStyle = bit ? `hsl(${i * 23}, 60%, 78%)` : `hsl(${i * 23}, 55%, 18%)`;
        g.fillRect(gx * 200, gy * 250, 200, 250);
      }
    }
    g.fillStyle = '#fff';
    g.font = 'bold 220px sans-serif';
    g.fillText(String(i), 300, 560);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    files.push(new File([blob], `dump-${i}.jpg`, { type: 'image/jpeg' }));
  }
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  const input = document.querySelector('input[accept="image/*,video/*"]');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, DUMP);
console.log(`✓ dropped ${DUMP} photos into Auto Montage`);

// pipeline runs, then lands in the montage preview (reel by default)
await page.waitForSelector('text=your auto montage', { timeout: 60000 });
console.log('✓ curated montage opened in Preview (zero editing)');

// the photo-count control must expose the WHOLE imported pool — not a capped 12.
// (slider max = the retained scored pool, independent of dedup)
await page.waitForSelector('text=Photos in this montage', { timeout: 8000 });
const sliderMax = Number(
  await page.getAttribute('input[aria-label="Number of photos in the montage"]', 'max'),
);
if (!(sliderMax >= DUMP - 1)) {
  errors.push(`photo-count control capped the pool: max=${sliderMax}, expected ≥ ${DUMP - 1}`);
} else {
  console.log(`✓ photo-count control exposes the full pool (up to ${sliderMax})`);
}

// drag it to the max and confirm the montage actually grows past the old 12-cap
await page.$eval('input[aria-label="Number of photos in the montage"]', (el) => {
  el.value = el.max;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
});
await page.waitForTimeout(2000);
const usedCount = Number(
  await page.getAttribute('input[aria-label="Number of photos in the montage"]', 'value'),
);
if (!(usedCount > 12)) {
  errors.push(`montage still capped: only ${usedCount} photos used after maxing the control`);
} else {
  console.log(`✓ montage uses ${usedCount} photos (past the old 12-cap)`);
}

// Shuffle regenerates it — a few times to prove it doesn't orphan project docs
await page.click('button:has-text("Shuffle")');
await page.waitForTimeout(900);
await page.click('button:has-text("Shuffle")');
await page.waitForTimeout(900);
await page.click('button:has-text("Shuffle")');
await page.waitForTimeout(1200);
console.log('✓ shuffle regenerated the montage (×3)');

// re-curating and shuffling must REUSE the one project doc, not spawn a new
// "— montage" row on Home each time
const projectCount = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open('montage-studio');
      req.onsuccess = () => {
        const tx = req.result.transaction(['projects'], 'readonly');
        const all = tx.objectStore('projects').getAll();
        all.onsuccess = () => resolve(all.result.length);
        all.onerror = () => resolve(-1);
      };
      req.onerror = () => resolve(-1);
    }),
);
if (projectCount !== 1) {
  errors.push(`shuffle/re-curate orphaned project docs: expected 1, found ${projectCount}`);
} else {
  console.log('✓ shuffle + re-curate reuse ONE project doc (no orphans)');
}

// switch to the carousel format and export the seamless-panel ZIP
await page.click('button:has-text("carousel")');
await page.waitForSelector('img[alt^="Panel"]', { timeout: 8000 });
const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.click('button:has-text("Export")');
const download = await downloadPromise;
const size = statSync(await download.path()).size;
console.log(`✓ exported ${download.suggestedFilename()} (${size} bytes)`);
if (!download.suggestedFilename().endsWith('.zip')) {
  errors.push(`expected a .zip, got ${download.suggestedFilename()}`);
}
if (size < 2000) errors.push('montage export suspiciously small');

await page.waitForTimeout(300);
await browser.close();
reportAndExit(errors);
console.log('\nAUTO MONTAGE SMOKE TEST PASSED');
