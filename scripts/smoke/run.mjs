// `npm run smoke` — builds nothing itself; expects `npm run build` output in
// dist/. Starts vite preview if needed, runs both suites, stops the server.
import { spawnSync } from 'node:child_process';
import { ensurePreview } from './browser.mjs';

const stop = await ensurePreview();
let failed = false;
for (const suite of [
  'smoke-ui.mjs',
  'smoke-import.mjs',
  'smoke-pipeline.mjs',
  'smoke-dialogs.mjs',
  'smoke-motion.mjs',
  'smoke-curate.mjs',
  'smoke-library.mjs',
  'smoke-automontage.mjs',
  'smoke-reel.mjs',
  'smoke-demo.mjs',
]) {
  console.log(`\n=== ${suite} ===`);
  const res = spawnSync('node', [`scripts/smoke/${suite}`], { stdio: 'inherit' });
  if (res.status !== 0) failed = true;
}
stop();
process.exit(failed ? 1 : 0);
