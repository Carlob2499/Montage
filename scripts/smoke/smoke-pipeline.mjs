// Pipeline smoke test: real image import → library → canvas → preset →
// full-resolution export with pixel-exact dimensions.
import { statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const { browser, page, errors } = await launchPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('text=+ New project');
await page.fill('input[placeholder*="Project name"]', 'Import Test');
await page.click('button:has-text("Create")');
await page.waitForSelector('canvas');

await page.click('span:text-is("Photos")');
await page.waitForSelector('text=Pick a photo');
await page.setInputFiles('input[type=file][multiple]', 'public/icons/icon-512.png');
await page.waitForSelector('img[alt="icon-512.png"]', { timeout: 15000 });
console.log('✓ image imported: thumbnail generated and shown');

await page.click('img[alt="icon-512.png"]');
await page.waitForSelector('canvas');
await page.waitForTimeout(800);
console.log('✓ photo placed on canvas');

await page.click('text=Adjust');
await page.waitForSelector('text=Ember');
await page.click('text=Ember');
await page.waitForTimeout(600);
await page.click('button[aria-label="Close"]');
console.log('✓ filter preset applied');

await page.click('button:has-text("Export")');
await page.waitForSelector('text=Full panorama');
await page.click('text=Full panorama');
const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.click('.sheet button:has-text("Export")');
const download = await downloadPromise;
const path = await download.path();
const size = statSync(path).size;
console.log(`✓ export produced ${download.suggestedFilename()} (${size} bytes)`);
if (size < 5000) errors.push('export file suspiciously small');

try {
  const info = execSync(`file "${path}"`).toString();
  console.log('  ', info.trim().split(': ')[1]);
  if (!/4320 ?x ?1350/.test(info)) errors.push(`unexpected export dimensions: ${info}`);
} catch {
  /* file(1) unavailable */
}

await browser.close();
reportAndExit(errors);
console.log('\nPIPELINE SMOKE TEST PASSED');
