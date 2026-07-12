// Curation smoke test: import photos into an album, run "Auto Montage" (score
// → curate → themed draft), and assert a project opens in the editor — with NO
// native dialog firing anywhere in the flow.
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const { browser, page, errors } = await launchPage();

page.on('dialog', (d) => {
  errors.push(`native dialog fired ("${d.message()}") — must be an in-app modal`);
  d.dismiss().catch(() => {});
});

await page.goto(BASE, { waitUntil: 'networkidle' });

// library → create an album via the in-app dialog
await page.waitForSelector('text=Photo Library', { timeout: 10000 });
await page.click('text=Photo Library');
await page.waitForSelector('text=+ Album', { timeout: 10000 });
await page.click('text=+ Album');
await page.waitForSelector('[data-testid="dialog-input"]', { timeout: 5000 });
await page.fill('[data-testid="dialog-input"]', 'Curate Test');
await page.click('[data-testid="dialog-confirm"]');
await page.waitForSelector('button:has-text("Curate Test")', { timeout: 8000 });
console.log('✓ album created');

// import three images
await page.setInputFiles('input[type=file][multiple]', [
  'public/icons/icon-512.png',
  'public/icons/icon-192.png',
  'public/icons/icon-180.png',
]);
await page.waitForSelector('img[alt="icon-512.png"]', { timeout: 20000 });
console.log('✓ photos imported');

// run Auto Montage from the album menu (the select carrying the option)
await page.selectOption('select:has(option[value="montage"])', 'montage');

// scoring overlay → vibe pre-flight sheet
await page.waitForSelector('text=Create montage', { timeout: 30000 });
console.log('✓ curation ran and the vibe sheet appeared');

await page.click('button:has-text("Create montage")');

// the curated montage opens in the editor
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(600);
console.log('✓ montage draft opened in the editor');

await browser.close();
reportAndExit(errors);
console.log('\nCURATE SMOKE TEST PASSED');
