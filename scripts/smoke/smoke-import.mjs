// Import stress smoke: the thing every user hits first. Prove a whole-album
// import (many large photos) is fast, drops nothing, decodes bounded (memory),
// and preserves the TRUE full-resolution dimensions on the stored record.
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const COUNT = 20;
const SRC_W = 3200;
const SRC_H = 2400;
const BUDGET_MS = 30000; // generous; real number is ~3s in headless

const { browser, page, errors } = await launchPage();
page.on('dialog', (d) => {
  errors.push(`native dialog fired ("${d.message()}")`);
  d.dismiss().catch(() => {});
});
await page.goto(BASE, { waitUntil: 'networkidle' });

// 1) the memory fix mechanism: at-decode downscale must actually shrink
const decoded = await page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 4000;
  c.height = 3000;
  c.getContext('2d').fillRect(0, 0, 4000, 3000);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  const bmp = await createImageBitmap(blob, {
    imageOrientation: 'from-image',
    resizeWidth: 1600,
    resizeQuality: 'high',
  });
  const w = bmp.width;
  bmp.close();
  return w;
});
if (decoded !== 1600) errors.push(`at-decode downscale broken: expected 1600, got ${decoded}`);
else console.log('✓ decode downscales a 4000px photo to 1600px (bounded memory)');

// 2) import a whole "album" of large photos through the real Library UI
await page.click('text=Photo Library');
await page.waitForSelector('button:has-text("Import photos")', { timeout: 8000 });
await page.evaluate(
  async ({ count, w, h }) => {
    const files = [];
    for (let i = 0; i < count; i++) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = `hsl(${i * 17}, 60%, 45%)`;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      g.font = 'bold 400px sans-serif';
      g.fillText(String(i), 200, h / 2 + 150);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      files.push(new File([blob], `photo-${i}.jpg`, { type: 'image/jpeg' }));
    }
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    const input = document.querySelector('input[type="file"][accept*="image"]');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },
  { count: COUNT, w: SRC_W, h: SRC_H },
);

const t0 = Date.now();
await page.waitForSelector(`text=/Imported ${COUNT} of ${COUNT}/`, { timeout: BUDGET_MS });
const elapsed = Date.now() - t0;
console.log(`✓ imported ${COUNT} × ${SRC_W}×${SRC_H} in ${elapsed}ms (${Math.round(elapsed / COUNT)}ms/photo), zero drops`);

// 3) the stored record keeps TRUE full-res dims; the proxy is bounded
const verify = await page.evaluate(
  ({ w }) =>
    new Promise((resolve) => {
      const req = indexedDB.open('montage-studio');
      req.onsuccess = () => {
        const dbi = req.result;
        const tx = dbi.transaction(['photos', 'proxies'], 'readonly');
        const photos = tx.objectStore('photos').getAll();
        photos.onsuccess = () => {
          const rows = photos.result;
          const fullRes = rows.filter((r) => r.width === w).length;
          const sample = rows[0];
          const pr = tx.objectStore('proxies').get(sample.id);
          pr.onsuccess = async () => {
            let proxyLong = 0;
            if (pr.result) {
              const bmp = await createImageBitmap(pr.result.blob);
              proxyLong = Math.max(bmp.width, bmp.height);
              bmp.close();
            }
            resolve({ total: rows.length, fullRes, proxyLong });
          };
        };
      };
      req.onerror = () => resolve({ total: 0, fullRes: 0, proxyLong: 0 });
    }),
  { w: SRC_W },
);
console.log(`✓ stored ${verify.total} photos; ${verify.fullRes} keep full-res width; proxy long edge = ${verify.proxyLong}px`);
if (verify.total < COUNT) errors.push(`only ${verify.total}/${COUNT} photos persisted (silent drops)`);
if (verify.fullRes < COUNT) errors.push(`${COUNT - verify.fullRes} records lost their true dimensions`);
if (verify.proxyLong > 1601) errors.push(`proxy not bounded: ${verify.proxyLong}px`);

await page.waitForTimeout(200);
await browser.close();
reportAndExit(errors);
console.log('\nIMPORT SMOKE TEST PASSED');
