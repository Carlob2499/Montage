// UI smoke test: project creation, template application, text editing,
// sheets, swipe preview, export sheet, persistence.
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const { browser, page, errors } = await launchPage({ welcomed: false });

await page.goto(BASE, { waitUntil: 'networkidle' });
// first run shows the cover page; Explore lands on Home
await page.waitForSelector('text=Keep it as an app', { timeout: 10000 });
console.log('✓ cover page renders on first run');
await page.click('text=Explore first');
await page.waitForSelector('text=+ New project', { timeout: 10000 });
console.log('✓ home screen renders after Start');

await page.click('text=+ New project');
await page.fill('input[placeholder*="Project name"]', 'Smoke Test');
await page.click('button:has-text("Create")');
await page.waitForSelector('canvas', { timeout: 10000 });
console.log('✓ editor canvas mounts');

await page.click('text=Layouts');
await page.waitForSelector('text=Horizon Line');
await page.click('text=Horizon Line');
// in-app confirm dialog (not native) — "Replace layers"
await page.waitForSelector('[data-testid="dialog-confirm"]', { timeout: 5000 });
await page.click('[data-testid="dialog-confirm"]');
await page.waitForTimeout(500);
console.log('✓ template applied via in-app dialog');

await page.click('span:text-is("Text")');
await page.waitForSelector('textarea');
await page.fill('textarea', 'HELLO SEAMS');
await page.click('button[aria-label="Close"]');
console.log('✓ text layer added and edited');

await page.click('text=Backdrop');
await page.waitForSelector('text=Gradient');
await page.click('.sheet button >> nth=10');
await page.click('button[aria-label="Close"]');
console.log('✓ background sheet works');

await page.click('span:text-is("Panels")');
await page.waitForSelector('text=Panel count');
await page.click('button[aria-label="Close"]');
console.log('✓ panels sheet works');

await page.click('text=Preview');
await page.waitForSelector('text=swipe preview', { timeout: 10000 });
await page.waitForTimeout(2500);
const imgs = await page.locator('img').count();
console.log(`✓ preview renders (${imgs} panel image(s))`);
await page.click('header button >> nth=0');

await page.waitForSelector('canvas');
await page.click('button:has-text("Export")');
await page.waitForSelector('text=JPEG quality');
console.log('✓ export sheet renders');

await page.click('button[aria-label="Close"]');
await page.click('header button >> nth=0');
await page.waitForSelector('text=+ New project');
// the projects live-query resolves a tick after Home mounts — wait for it
try {
  await page.waitForSelector('text=Smoke Test', { timeout: 5000 });
  console.log('✓ project persisted to home list');
} catch {
  errors.push('project missing from home list');
}

await browser.close();
reportAndExit(errors);
console.log('\nUI SMOKE TEST PASSED');
