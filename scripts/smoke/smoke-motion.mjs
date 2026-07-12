// Motion smoke test: generate a tiny in-page WebM clip, import it as a video,
// then drive the "Motion panels" export and assert it produces a ZIP WITHOUT
// any native dialog firing. Encode is codec/timing-sensitive, so the assertion
// stays modest (a non-trivial file is produced); it SKIPs cleanly if the
// headless browser can't record canvas video.
import { statSync } from 'node:fs';
import { BASE, launchPage, reportAndExit } from './browser.mjs';

const { browser, page, errors } = await launchPage();

// fail loudly if any native prompt/confirm/alert fires (they're dead in
// standalone iOS PWAs — the app must use its in-app dialogs everywhere)
page.on('dialog', (d) => {
  errors.push(`native dialog fired: ${d.type()} "${d.message()}"`);
  void d.dismiss();
});

await page.goto(BASE, { waitUntil: 'networkidle' });

// bail out cleanly if this browser can't record canvas video
const canRecord = await page.evaluate(
  () =>
    typeof MediaRecorder !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].some((t) =>
      MediaRecorder.isTypeSupported(t),
    ),
);
if (!canRecord) {
  console.log('… MediaRecorder/WebM unavailable — SKIPPING motion smoke');
  await browser.close();
  process.exit(0);
}

await page.click('text=+ New project');
await page.fill('input[placeholder*="Project name"]', 'Motion Test');
await page.click('button:has-text("Create")');
await page.waitForSelector('canvas');

// record ~1.1s of animated canvas as a WebM, hand the bytes back as base64
const webmB64 = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
  const rec = new MediaRecorder(stream, { mimeType: type });
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise((res) => (rec.onstop = res));
  rec.start();
  const t0 = performance.now();
  await new Promise((res) => {
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      ctx.fillStyle = `hsl(${(t * 160) % 360}, 80%, 55%)`;
      ctx.fillRect(0, 0, 320, 240);
      if (t >= 1.1) {
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
const buffer = Buffer.from(webmB64, 'base64');
if (buffer.length < 200) {
  errors.push('generated WebM is suspiciously small');
}
console.log(`✓ generated ${buffer.length}-byte WebM clip in-page`);

// import it as a video through the editor's photo picker
await page.click('span:text-is("Photos")');
await page.waitForSelector('text=Pick a photo');
await page.setInputFiles('input[type=file][multiple]', {
  name: 'clip.webm',
  mimeType: 'video/webm',
  buffer,
});
await page.waitForSelector('img[alt="clip.webm"]', { timeout: 20000 });
console.log('✓ video imported: poster thumbnail generated');

await page.click('img[alt="clip.webm"]');
await page.waitForSelector('canvas');
await page.waitForTimeout(800);
console.log('✓ clip placed on canvas');

// export → Motion panels → expect a ZIP, no native dialog
await page.click('button:has-text("Export")');
await page.waitForSelector('text=Motion panels (video)', { timeout: 10000 });
await page.click('text=Motion panels (video)');
const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
await page.click('.sheet button:has-text("Export motion panels")');
const download = await downloadPromise;
const path = await download.path();
const size = statSync(path).size;
console.log(`✓ motion export produced ${download.suggestedFilename()} (${size} bytes)`);
if (!download.suggestedFilename().endsWith('.zip')) {
  errors.push(`expected a .zip bundle, got ${download.suggestedFilename()}`);
}
if (size < 2000) errors.push('motion bundle suspiciously small');

await page.waitForTimeout(300);
await browser.close();
reportAndExit(errors);
console.log('\nMOTION SMOKE TEST PASSED');
