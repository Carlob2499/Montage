// Library workflow smoke: favorite a photo + filter to favorites, and confirm
// the editor's version-history sheet captures a snapshot. Native dialogs are a
// failure (in-app modals only). The map button must be hidden with no GPS.
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const { browser, page, errors } = await launchPage();
page.on('dialog', (d) => {
  errors.push(`native dialog fired ("${d.message()}")`);
  d.dismiss().catch(() => {});
});

await page.goto(BASE, { waitUntil: 'networkidle' });

// library → album → import 2 photos
await page.click('text=Photo Library');
await page.waitForSelector('text=+ Album', { timeout: 10000 });
await page.click('text=+ Album');
await page.waitForSelector('[data-testid="dialog-input"]', { timeout: 5000 });
await page.fill('[data-testid="dialog-input"]', 'Trip 5');
await page.click('[data-testid="dialog-confirm"]');
await page.waitForSelector('button:has-text("Trip 5")', { timeout: 8000 });

await page.setInputFiles('input[type=file][multiple]', [
  'public/icons/icon-512.png',
  'public/icons/icon-192.png',
]);
await page.waitForSelector('img[alt="icon-512.png"]', { timeout: 20000 });
console.log('✓ album with photos ready');

// the map button must NOT appear (imported icons have no GPS)
if (await page.locator('button:has-text("📍 Map")').count()) {
  errors.push('map button showed for photos without GPS');
} else {
  console.log('✓ map button hidden without GPS');
}

// favorite the first photo via its heart, then filter to favorites
await page.click('[aria-label="Favorite"]', { timeout: 8000 });
await page.waitForTimeout(300);
await page.click('button:has-text("Favorites")');
await page.waitForTimeout(400);
const favCount = await page.locator('img[alt^="icon-"]').count();
if (favCount !== 1) errors.push(`favorites filter showed ${favCount} photos, expected 1`);
else console.log('✓ favorite + Favorites filter shows exactly the favorited photo');
await page.click('button:has-text("Favorites")'); // clear

// new project → make an edit → check version history captures a snapshot
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('text=New project');
await page.fill('input[placeholder*="Project name"]', 'History Test');
await page.click('button:has-text("Create")');
await page.waitForSelector('canvas');

// add a text layer (an edit → dirty), close the text sheet, then open History
await page.click('text=Text');
await page.waitForTimeout(400);
await page.click('button[aria-label="Close"]');
await page.waitForTimeout(200);
await page.click('button[aria-label="Version history"]');
await page.waitForSelector('text=Version history', { timeout: 8000 });
await page.click('button:has-text("Save a version now")');
await page.waitForSelector('button:has-text("Restore")', { timeout: 8000 });
console.log('✓ version history captured a snapshot');

await browser.close();
reportAndExit(errors);
console.log('\nLIBRARY SMOKE TEST PASSED');
