// Shared helpers for the headless-browser smoke tests.
import { chromium } from 'playwright-core';
import { execSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

export const BASE = 'http://localhost:4173/Montage/';

/** Find a Chromium binary: $CHROMIUM_PATH, Playwright's cache, or PATH. */
export function findChromium() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      for (const rel of ['chrome-linux/headless_shell', 'chrome-linux/chrome']) {
        const p = `${root}/${dir}/${rel}`;
        if (existsSync(p)) return p;
      }
    }
  }
  try {
    return execSync('which chromium chromium-browser google-chrome | head -1')
      .toString()
      .trim();
  } catch {
    throw new Error('No Chromium found — set CHROMIUM_PATH');
  }
}

export async function launchPage({ welcomed = true } = {}) {
  const browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  if (welcomed) {
    // skip the first-run cover page (tested separately in smoke-ui)
    await page.addInitScript(() => localStorage.setItem('montage-welcomed', '1'));
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return { browser, page, errors };
}

export function reportAndExit(errors) {
  const fatal = errors.filter(
    (e) => !e.includes('Download the React DevTools') && !e.includes('favicon'),
  );
  if (fatal.length) {
    console.log('\nERRORS:');
    for (const e of fatal) console.log(' -', e);
    process.exit(1);
  }
}

/** Start `vite preview` if nothing is serving; returns a stop() fn. */
export async function ensurePreview() {
  try {
    const res = await fetch(BASE);
    if (res.ok) return () => {};
  } catch {
    /* not running — start it */
  }
  const child = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(BASE);
      if (res.ok) break;
    } catch {
      /* retry */
    }
  }
  return () => child.kill();
}
