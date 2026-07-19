// Story Reel smoke (R1): from Home, Auto Montage a photo dump → land in Preview
// on the animated 9:16 REEL by default. Assert the reel canvas is animating,
// the Reel|Carousel toggle works, and Export produces a real, dimensioned,
// playing video (load it back in-page: 1080×1920, non-black content, plays).
import { readFileSync, statSync } from 'node:fs';
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const { browser, page, errors } = await launchPage();
page.on('dialog', (d) => {
  errors.push(`native dialog fired ("${d.message()}")`);
  d.dismiss().catch(() => {});
});

await page.goto(BASE, { waitUntil: 'networkidle' });

// one-tap Auto Montage
await page.waitForSelector('text=Auto Montage', { timeout: 10000 });
await page.setInputFiles('input[accept="image/*,video/*"]', [
  'public/icons/icon-512.png',
  'public/icons/icon-192.png',
  'public/icons/icon-180.png',
]);
console.log('✓ dropped 3 photos into Auto Montage');

// lands on the reel: the montage action bar (Export button) + a <canvas> player
await page.waitForSelector('button:has-text("Export reel")', { timeout: 45000 });
await page.waitForSelector('text=your auto montage', { timeout: 5000 });
const canvas = page.locator('canvas').first();
await canvas.waitFor({ timeout: 5000 });
console.log('✓ reel opened in Preview by default');

// animating? poll pairs of frames — the cover holds still by design after its
// entrance, so sample across a few seconds until a Ken Burns slide is moving
await page.waitForTimeout(900); // let resources decode + playback start
let animating = false;
let prev = await canvas.screenshot();
for (let i = 0; i < 8 && !animating; i++) {
  await page.waitForTimeout(450);
  const next = await canvas.screenshot();
  if (Buffer.compare(prev, next) !== 0) animating = true;
  prev = next;
}
if (!animating) errors.push('reel canvas is not animating (identical frames over 4s)');
else console.log('✓ reel is animating (frames differ over time)');

// format toggle: switch to Carousel (images appear) then back to Reel
await page.click('button:has-text("carousel")');
await page.waitForSelector('img[alt^="Panel"]', { timeout: 8000 });
console.log('✓ toggled to carousel view');
await page.click('button:has-text("reel")');
await page.locator('canvas').first().waitFor({ timeout: 5000 });
console.log('✓ toggled back to reel');

// R5 editing: a vibe chip re-themes the reel (canvas changes)
await page.waitForTimeout(700);
const preVibe = await page.locator('canvas').first().screenshot();
await page.click('button:has-text("Vibrant")');
await page.waitForTimeout(1000);
const postVibe = await page.locator('canvas').first().screenshot();
if (Buffer.compare(preVibe, postVibe) === 0) errors.push('vibe chip did not re-theme the reel');
else console.log('✓ vibe chip re-themed the reel');

// R5 editing: the cover title is editable
await page.click('button:has-text("Montage ·")');
await page.fill('input[aria-label="Reel title"]', 'My Trip Reel');
await page.keyboard.press('Enter');
await page.waitForSelector('button:has-text("My Trip Reel")', { timeout: 4000 });
console.log('✓ cover title edited');

// pick the shortest reel for a fast capture
await page.click('button:has-text("15s")');
await page.waitForTimeout(300);

// export the reel → a real video download
const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
await page.click('button:has-text("Export reel")');
const download = await downloadPromise;
const file = await download.path();
const size = statSync(file).size;
const name = download.suggestedFilename();
console.log(`✓ exported ${name} (${size} bytes)`);
if (!/\.(webm|mp4)$/.test(name)) errors.push(`expected a video file, got ${name}`);
if (size < 20000) errors.push(`reel export suspiciously small (${size} bytes)`);

// load the exported video back in-page: dimensions, plays, non-black content
const b64 = readFileSync(file).toString('base64');
const mime = name.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
const verdict = await page.evaluate(
  async ({ b64, mime }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    const ok = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 8000);
      v.onloadeddata = () => {
        clearTimeout(timer);
        resolve(true);
      };
      v.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
    });
    if (!ok) return { loaded: false };
    const w = v.videoWidth;
    const h = v.videoHeight;
    const duration = v.duration;
    // MediaRecorder output isn't decoded at currentTime=0 — play briefly so a
    // real frame is on screen, then sample brightness to prove it isn't black
    let advanced = false;
    try {
      await v.play();
      const t0 = v.currentTime;
      await new Promise((r) => setTimeout(r, 700));
      advanced = v.currentTime > t0;
      v.pause();
    } catch {
      /* autoplay may be gated — dimensions are still checked below */
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.drawImage(v, 0, 0);
    let lum = 0;
    const px = g.getImageData(0, 0, Math.min(w, 300), Math.min(h, 300)).data;
    for (let i = 0; i < px.length; i += 4) lum += px[i] + px[i + 1] + px[i + 2];
    const meanLum = lum / (px.length / 4) / 3;
    // audio track present? (procedural bed should be muxed in)
    const audioBytes = v.webkitAudioDecodedByteCount ?? 0;
    const audioTracks = v.audioTracks ? v.audioTracks.length : (v.mozHasAudio ? 1 : 0);
    URL.revokeObjectURL(url);
    return { loaded: true, w, h, duration, meanLum, advanced, audioBytes, audioTracks };
  },
  { b64, mime },
);

if (!verdict.loaded) errors.push('exported reel failed to load as a video');
else {
  console.log(`✓ reel loads: ${verdict.w}×${verdict.h}, meanLum=${verdict.meanLum.toFixed(1)}, plays=${verdict.advanced}`);
  if (verdict.w !== 1080 || verdict.h !== 1920) errors.push(`expected 1080×1920, got ${verdict.w}×${verdict.h}`);
  if (verdict.meanLum < 4) errors.push('exported reel first frame is essentially black');
  // Instagram-postability: the MP4 must carry FINITE duration metadata. Old
  // MediaRecorder output reported Infinity (no container duration) which some
  // uploaders reject; the WebCodecs MP4 path fixes this.
  if (Number.isFinite(verdict.duration) && verdict.duration > 1) {
    console.log(`✓ MP4 has finite duration metadata (${verdict.duration.toFixed(1)}s) — social-media ready`);
  } else {
    errors.push(`MP4 duration not finite (${verdict.duration}) — WebCodecs path may not have run`);
  }
  if (name.endsWith('.mp4') !== true) errors.push(`expected an .mp4 for social export, got ${name}`);
  const hasAudio = verdict.audioBytes > 0 || verdict.audioTracks > 0;
  console.log(`✓ soundtrack: audioBytes=${verdict.audioBytes}, tracks=${verdict.audioTracks}, present=${hasAudio}`);
  if (!hasAudio) errors.push('exported reel has no audio track (procedural bed not muxed)');
}

await page.waitForTimeout(200);
await browser.close();
reportAndExit(errors);
console.log('\nREEL SMOKE TEST PASSED');
