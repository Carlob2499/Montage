// Auto Montage smoke: the flagship one-tap flow. From Home, drop a few photos
// into "Auto Montage" → the pipeline (import → score → curate → stitch) runs
// and lands on a finished, swipeable montage in Preview. Then Shuffle and
// Export. No native dialog may fire.
import { statSync } from 'node:fs';
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const { browser, page, errors } = await launchPage();
page.on('dialog', (d) => {
  errors.push(`native dialog fired ("${d.message()}")`);
  d.dismiss().catch(() => {});
});

await page.goto(BASE, { waitUntil: 'networkidle' });

// tap the Auto Montage hero and feed it a photo dump
await page.waitForSelector('text=Auto Montage', { timeout: 10000 });
await page.setInputFiles('input[accept="image/*,video/*"]', [
  'public/icons/icon-512.png',
  'public/icons/icon-192.png',
  'public/icons/icon-180.png',
]);
console.log('✓ dropped 3 photos into Auto Montage');

// pipeline runs, then lands in the montage preview (Export button = montage bar)
await page.waitForSelector('button:has-text("Export")', { timeout: 40000 });
await page.waitForSelector('text=your auto montage', { timeout: 5000 });
console.log('✓ curated montage opened in Preview (zero editing)');

// Shuffle regenerates it
await page.click('button:has-text("Shuffle")');
await page.waitForTimeout(1500);
console.log('✓ shuffle regenerated the montage');

// Export saves a ZIP
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
