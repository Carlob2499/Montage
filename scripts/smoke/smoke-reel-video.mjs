// Reel-with-video smoke: the "video dump" case. Import a real clip + a couple of
// stills through Auto Montage, land on the reel, and prove the reel EXPORT
// includes the moving clip and still produces a valid, playable MP4 (frame-exact
// WebCodecs path). Skips cleanly if the headless browser can't record canvas.
import { readFileSync, statSync } from 'node:fs';
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const { browser, page, errors } = await launchPage();
page.on('dialog', (d) => {
  errors.push(`native dialog fired ("${d.message()}")`);
  d.dismiss().catch(() => {});
});
await page.goto(BASE, { waitUntil: 'networkidle' });

const canRecord = await page.evaluate(
  () =>
    typeof MediaRecorder !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].some((t) =>
      MediaRecorder.isTypeSupported(t),
    ),
);
if (!canRecord) {
  console.log('… MediaRecorder/WebM unavailable — SKIPPING reel-video smoke');
  await browser.close();
  process.exit(0);
}

// generate a ~1.3s animated WebM clip in-page
const webmB64 = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
  const rec = new MediaRecorder(stream, { mimeType: type });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((res) => (rec.onstop = res));
  rec.start();
  const t0 = performance.now();
  await new Promise((res) => {
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      ctx.fillStyle = `hsl(${(t * 200) % 360}, 80%, 55%)`;
      ctx.fillRect(0, 0, 480, 640);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 120px sans-serif';
      ctx.fillText(String(Math.floor(t * 10)), 200, 340);
      if (t >= 1.3) {
        rec.stop();
        res();
      } else requestAnimationFrame(draw);
    };
    draw();
  });
  await stopped;
  const buf = await new Blob(chunks, { type: 'video/webm' }).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
});
const clip = Buffer.from(webmB64, 'base64');
if (clip.length < 200) errors.push('generated WebM clip is suspiciously small');
console.log(`✓ generated ${clip.length}-byte WebM clip`);

// feed the clip + two stills into Auto Montage (all as buffers — Playwright
// won't mix file paths with buffers)
await page.waitForSelector('text=Auto Montage', { timeout: 10000 });
await page.setInputFiles('input[accept="image/*,video/*"]', [
  { name: 'clip.webm', mimeType: 'video/webm', buffer: clip },
  { name: 'a.png', mimeType: 'image/png', buffer: readFileSync('public/icons/icon-512.png') },
  { name: 'b.png', mimeType: 'image/png', buffer: readFileSync('public/icons/icon-192.png') },
]);
console.log('✓ dropped a clip + 2 stills into Auto Montage');

// lands on the reel
await page.waitForSelector('button:has-text("Export reel")', { timeout: 60000 });
console.log('✓ montage with a video clip opened as a reel');

// confirm a video record actually persisted (the clip made it into the album)
const videoCount = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open('montage-studio');
      req.onsuccess = () => {
        const tx = req.result.transaction(['photos'], 'readonly');
        const all = tx.objectStore('photos').getAll();
        all.onsuccess = () => resolve(all.result.filter((r) => r.kind === 'video').length);
        all.onerror = () => resolve(0);
      };
      req.onerror = () => resolve(0);
    }),
);
if (videoCount < 1) errors.push('no video record persisted from the clip import');
else console.log(`✓ ${videoCount} video clip(s) in the album`);

// export the reel (shortest for a fast capture) → a real, playable MP4
await page.click('button:has-text("15s")').catch(() => {});
await page.waitForTimeout(300);
const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
await page.click('button:has-text("Export reel")');
const download = await downloadPromise;
const file = await download.path();
const size = statSync(file).size;
const name = download.suggestedFilename();
console.log(`✓ exported ${name} (${size} bytes)`);
if (size < 20000) errors.push(`reel-with-video export suspiciously small (${size} bytes)`);

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
      v.onloadeddata = () => (clearTimeout(timer), resolve(true));
      v.onerror = () => (clearTimeout(timer), resolve(false));
    });
    if (!ok) return { loaded: false };
    const out = { loaded: true, w: v.videoWidth, h: v.videoHeight, duration: v.duration };
    URL.revokeObjectURL(url);
    return out;
  },
  { b64, mime },
);
if (!verdict.loaded) errors.push('exported reel-with-video failed to load as a video');
else {
  console.log(`✓ plays back: ${verdict.w}×${verdict.h}, duration=${verdict.duration}`);
  if (verdict.w !== 1080 || verdict.h !== 1920) {
    errors.push(`expected 1080×1920, got ${verdict.w}×${verdict.h}`);
  }
  if (name.endsWith('.mp4') && !(Number.isFinite(verdict.duration) && verdict.duration > 1)) {
    errors.push(`MP4 duration not finite (${verdict.duration})`);
  }
}

await page.waitForTimeout(200);
await browser.close();
reportAndExit(errors);
console.log('\nREEL-VIDEO SMOKE TEST PASSED');
