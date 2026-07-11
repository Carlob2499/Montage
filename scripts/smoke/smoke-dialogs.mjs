// Dialog smoke test: proves album creation (and destructive confirms) use
// IN-APP modals, not native prompt()/confirm() — the exact bug that made the
// installed iOS PWA unable to add albums. A native dialog firing is a failure.
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const { browser, page, errors } = await launchPage();

// ANY native dialog is a regression — the whole point is that we no longer use them
page.on('dialog', (d) => {
  errors.push(`native dialog fired ("${d.message()}") — must be an in-app modal`);
  d.dismiss().catch(() => {});
});

await page.goto(BASE, { waitUntil: 'networkidle' });

// go to the library (empty state) via Home
await page.waitForSelector('text=Photo Library', { timeout: 10000 });
await page.click('text=Photo Library');
await page.waitForSelector('text=+ Album', { timeout: 10000 });

// create an album through the in-app dialog
await page.click('text=+ Album');
await page.waitForSelector('[data-testid="dialog-input"]', { timeout: 5000 });
console.log('✓ "+ Album" opens an in-app dialog (not native prompt)');
await page.fill('[data-testid="dialog-input"]', 'Trip 2026');
await page.click('[data-testid="dialog-confirm"]');

// the album chip should now exist and be selected — only possible if the
// promise-based prompt actually resolved and the DB write ran
await page.waitForSelector('button:has-text("Trip 2026")', { timeout: 8000 });
console.log('✓ album created and appears in the album strip');

// cancelling a prompt must NOT create an album
await page.click('text=+ Album');
await page.waitForSelector('[data-testid="dialog-input"]', { timeout: 5000 });
await page.fill('[data-testid="dialog-input"]', 'Should Not Exist');
await page.click('[data-testid="dialog-cancel"]');
await page.waitForTimeout(300);
if (await page.locator('button:has-text("Should Not Exist")').count()) {
  errors.push('cancelling the album dialog still created an album');
} else {
  console.log('✓ cancelling the dialog creates nothing');
}

await browser.close();
reportAndExit(errors);
console.log('\nDIALOGS SMOKE TEST PASSED');
