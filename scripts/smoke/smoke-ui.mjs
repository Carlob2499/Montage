// UI smoke test: project creation, template application, text editing,
// sheets, swipe preview, export sheet, persistence.
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const { browser, page, errors } = await launchPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Montage', { timeout: 10000 });
console.log('✓ home screen renders');

await page.click('text=+ New project');
await page.fill('input[placeholder*="Project name"]', 'Smoke Test');
await page.click('button:has-text("Create")');
await page.waitForSelector('canvas', { timeout: 10000 });
console.log('✓ editor canvas mounts');

await page.click('text=Layouts');
await page.waitForSelector('text=Horizon Line');
page.once('dialog', (d) => d.accept());
await page.click('text=Horizon Line');
await page.waitForTimeout(500);
console.log('✓ template applied');

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
if (!(await page.locator('text=Smoke Test').count())) {
  errors.push('project missing from home list');
} else {
  console.log('✓ project persisted to home list');
}

await browser.close();
reportAndExit(errors);
console.log('\nUI SMOKE TEST PASSED');
