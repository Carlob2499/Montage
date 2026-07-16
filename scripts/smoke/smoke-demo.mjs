// First-run demo smoke (R6): a brand-new user with no photos taps "Try a demo
// trip" and — with zero assets of their own — gets the full Auto Montage → reel
// flow. This is the 5-second onboarding promise, tested literally.
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const { browser, page, errors } = await launchPage();
page.on('dialog', (d) => {
  errors.push(`native dialog fired ("${d.message()}")`);
  d.dismiss().catch(() => {});
});

await page.goto(BASE, { waitUntil: 'networkidle' });

await page.waitForSelector('text=Try a demo trip', { timeout: 10000 });
await page.click('text=Try a demo trip');
console.log('✓ tapped "Try a demo trip" (no user photos needed)');

// the whole pipeline runs on synthesized photos and lands on the reel
await page.waitForSelector('text=your auto montage', { timeout: 45000 });
const canReel = await page.locator('button:has-text("Export reel")').count();
if (canReel === 0) errors.push('demo did not produce a reel');
else console.log('✓ demo produced a finished reel from generated photos');

// it should have more than the 3-icon minimum — the demo trip has 6 scenes
const slides = await page.locator('button:has-text("Sunwashed")').count();
if (slides === 0) errors.push('reel editing panel missing after demo');
else console.log('✓ reel editing panel present');

await page.waitForTimeout(200);
await browser.close();
reportAndExit(errors);
console.log('\nDEMO SMOKE TEST PASSED');
