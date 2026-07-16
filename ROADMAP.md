# Montage Studio — Roadmap

**North star:** an extremely functional, visually stunning, *automated* AI photo-montage
maker. A user dumps trip photos in, and with zero editing gets a share-ready **reel/story**
— and can polish it in the editor if they want. Everything stays local-first/offline
(no backend, no runtime network calls).

**Read `CLAUDE.md` first.** The architecture invariants there (seam continuity,
preview/export parity, gesture-scoped undo, doc normalization, iOS constraints) are
non-negotiable and every batch below must honor them.

## Where we are (shipped)

- Full collage/carousel editor with seam-continuous panels, templates, stickers, frame
  styles, layer effects (shadow/border/mask), text, adjustments, crop.
- On-device curation (sharpness/exposure/colorfulness, pHash dedup, vibe detection, MMR
  diversity) — pure, tested, scored off 320px thumbs.
- **One-tap Auto Montage**: Home hero → import → score → curate → vibe-themed stitched
  carousel in Preview with Shuffle / Edit / Export (ZIP). Vibe themes carry background,
  frame style, cover ink + typography.
- Motion: video-in-cell playback, motion panel export (realtime MediaRecorder capture via
  `renderRegion`), Ken Burns panorama export. `9:16` Story aspect already exists.
- Library: favorites/filters, offline trip map, persistent revision snapshots.
- Design system: token-based Tailwind v4 theme, SVG icon set, 44px touch targets.
- 207 unit tests + 7 headless smoke suites; deploys to GitHub Pages on push to `main`.

## The gap

The Auto Montage output is a **static carousel**. The stated goal is **trip reels and
stories** — i.e. animated 9:16 *video* with motion, pacing, and music. That is the
single biggest missing piece; the batches are ordered around closing it.

---

# Validation & preview playbook (MANDATORY — read before every batch)

"Tests pass" is necessary but NOT sufficient. Every batch ends with you having **looked
at the product with your own eyes** (screenshots/frames read back as images) and having
**verified the deployed site**, not just the local build. The user is judging this app
against SCRL — visual quality regressions are release blockers even when all tests are
green.

## Layer 1 — The automated gate (every push, no exceptions)

```
npx tsc -b --noEmit && npm test && npm run build && npm run smoke
```

- `npm test` = Vitest over `src/**/*.test.ts`. Every bug fix lands with a regression test
  where the logic is pure (`src/lib`, `src/state`). New pure modules ship WITH tests.
- `npm run smoke` = 7+ Playwright suites against the production build
  (`scripts/smoke/run.mjs`). Add a new suite for every user-visible flow you add, and
  register it in `run.mjs`. Reuse `scripts/smoke/browser.mjs`:
  - `launchPage()` — 390×844 iPhone-ish viewport, collects `pageerror` + console errors;
    ANY page error fails the suite.
  - `ensurePreview()` — serves `dist/` at `http://localhost:4173/Montage/`.
  - Always install the native-dialog guard (`page.on('dialog', …)` → push an error);
    native prompt/confirm firing is always a bug (we have an in-app dialog system).
  - Konva stages mount 3 `<canvas>` elements — use `.locator('canvas').first()` or
    you'll hit strict-mode violations.
- Downloads: assert via `page.waitForEvent('download')`, then check
  `suggestedFilename()` extension AND `statSync(await download.path()).size` against a
  floor (a 2KB "video" is a broken video).

## Layer 2 — Visual eyeball loop (every user-visible change)

You can read PNGs. Use that: **screenshot the real app and look at it.** Write throwaway
scripts to the scratchpad directory (NOT the repo), e.g.
`<scratchpad>/shot.mjs`:

```js
import { launchPage, ensurePreview, BASE } from '/home/user/Montage/scripts/smoke/browser.mjs';
const stop = await ensurePreview();
const { browser, page } = await launchPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
// ...drive the flow exactly like a smoke test would...
await page.screenshot({ path: process.env.SHOT ?? 'out.png' });
await browser.close(); stop();
```

Then `Read` the PNG and honestly answer: *would a designer ship this?* Check text
contrast, alignment, spacing, touch-target size, clipping/overflow, and whether the vibe
theming actually looks good — not just "did it render".

**Minimum screenshot set for any Auto Montage / reel change** (capture ALL, view ALL):
1. Home (hero button state).
2. The progress overlay mid-pipeline (throttle if needed to catch it).
3. Preview landing — cover panel visible.
4. Preview scrolled/advanced to a middle photo panel (seams, frames).
5. The outro panel.
6. Each of the 5 vibes' cover (drive Shuffle or build docs directly) whenever ink,
   fonts, backgrounds, or cover layout change — light-bg `muted` is where contrast bugs
   hide.
7. After export: re-screenshot to confirm no error toast / broken state.

## Layer 3 — Verifying rendered OUTPUT (the actual deliverable)

The screenshots above verify the UI; the user's deliverable is the exported pixels/video.
Verify those directly:

- **Still/ZIP exports:** in a page context, unzip is overkill — instead call the pure
  renderer directly in Node-adjacent tests where possible, and in the browser sample the
  export canvas: draw `renderRegion` output for panel N and N+1, read the 1px column at
  the shared boundary from both, and assert near-equality (this is the seam-continuity
  check; the pattern exists in `editStack.test.ts` — keep using it for anything spatial).
- **Video exports (reels, motion):** after `download`, load the file back in the page:
  ```js
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const v = document.createElement('video'); v.src = url; v.playsInline = true; v.muted = true;
  await onceLoadedMetadata(v, 8000);            // ALWAYS timeout-bounded (iOS lesson)
  // assert: v.duration within ±10% of target; v.videoWidth/Height === 1080/1920
  ```
  Then **sample frames**: seek to t = 0%, 25%, 50%, 75%, 99% of duration, draw each onto
  a canvas, `page.screenshot()` or `canvas.toDataURL()` them out to the scratchpad, and
  **Read every frame as an image**. You are checking: cover title legible, Ken Burns
  actually moving (frames at 25% vs 50% of the same slide must differ), transitions not
  garbage (no black flash unless dip-to-color intends it), outro present, nothing
  stretched or letterboxed wrong.
- **Frame-diff assertion for motion:** programmatically compare two sampled frames from
  the same slide (mean absolute pixel diff > threshold ⇒ motion is real; ≈ 0 ⇒ the "Ken
  Burns" is silently static — a classic failure that eyeballs alone can miss at 2 frames).
- **Audio (Batch R2):** decode the exported file's audio track via
  `AudioContext.decodeAudioData` on the extracted bytes where the container allows, or at
  minimum assert exported-with-audio size > exported-without-audio size by a sane margin,
  AND that `v.mozHasAudio / webkitAudioDecodedByteCount / audioTracks` (feature-detect)
  reports a track.

## Layer 4 — Preview/export parity check (invariant #2 applied)

Whenever a visual feature touches both the Konva editor/player and the export renderer:
1. Build one deterministic doc (fixed seed, fixed photos).
2. Screenshot the Konva stage showing panel/slide X.
3. Render the same panel/slide X via the export path to a canvas; screenshot it.
4. Read both images side by side. They must agree in geometry, color, text metrics, and
   effects. Small AA differences are fine; different positions/sizes/colors are bugs.
For reels this becomes: player frame at time t vs `drawReelFrame(..., t)` — same t, same
doc, must match.

## Layer 5 — Deployed-product verification (every push to main)

1. `git push -u origin main` deploys via `.github/workflows/deploy.yml`; also sync the
   dev branch `claude/montage-studio-collage-carousel-he4b9g`.
2. Note the LOCAL bundle: `ls dist/assets/index-*.js`.
3. Poll `https://carlob2499.github.io/Montage/` until its `index-*.js` hash matches local
   (deploy-pages step has taken 5–10 min; poll every ~20s, don't give up early, don't
   `sleep` blindly once — loop).
4. Then run at least ONE end-to-end pass against the LIVE URL (point a throwaway
   Playwright script at the live site — same flows as smoke, at minimum: app boots with
   zero console errors, Auto Montage hero present). The live site has the `/Montage/`
   base path and service-worker caching; a stale SW or wrong base path only reproduces
   THERE. If the live check can't run (network restrictions), say so explicitly in your
   report — never imply it was verified when it wasn't.
5. Report the live link + verified bundle hash to the user at the end of every batch.

## Definition of done (per batch — all six layers)

- [ ] Gate green (typecheck, unit, build, smoke — including NEW suites for new flows).
- [ ] Screenshot set captured and actually Read; any "would a designer ship this?" fail
      fixed before push.
- [ ] Output artifacts verified (ZIP contents / video duration+dimensions+sampled frames
      / frame-diff motion proof / audio track present).
- [ ] Parity screenshots for any dual-path visual feature.
- [ ] `CLAUDE.md` updated (new invariants, gotchas paid for, test count).
- [ ] Deployed, live bundle hash verified, one live-URL boot check, link reported.

---

# Batch R1 — Story Reel engine (the core gap) 🎬

Turn a curated pick-set into an animated 9:16 video reel, fully automatic.

1. **Reel document model.** A reel is a sequence of *slides* (photoId, duration,
   motion preset, transition-in) + a cover title card + outro, all derived from the same
   `curateAlbum` picks and vibe theme. Add a pure `buildReelDoc(album, picks, vibe, opts)`
   next to `buildAutoMontageDoc` (`src/lib/curation/`). New fields MUST go through
   `normalizeProjectDoc` (or a sibling `normalizeReelDoc`) + tests — invariant #4.
2. **Slide motion = Ken Burns per photo.** Reuse the panorama Ken Burns math
   (`src/lib/videoExport.ts`) generalized to per-slide pan/zoom between two `coverCrop`
   windows (start/end rect). Pure interpolation function, seeded per layer id, tested.
3. **Transitions.** Start with 3 that read well and are cheap on canvas: crossfade,
   dip-to-color (vibe background color), and whip-pan (directional slide + motion blur via
   stacked low-alpha draws — `ctx.filter` is not safe on iOS < 18, see CLAUDE.md).
4. **Renderer.** One pure `drawReelFrame(ctx, reelDoc, tMs, resources)` used by BOTH the
   in-app preview player (rAF loop on a canvas) and the exporter — this is preview/export
   parity (invariant #2) applied to time. Photos render through the existing decode/cover
   pipeline; respect `MAX_CANVAS_AREA`.
5. **Export v1: realtime capture.** `canvas.captureStream()` + MediaRecorder at
   1080×1920, mirroring `motionExport.ts` (bounded awaits, `playsInline` — see iOS notes).
   Feature-detect via `MediaRecorder.isTypeSupported` and pick the best of
   `video/mp4;codecs=avc1` → `video/webm;codecs=vp9` → `video/webm`.
6. **Duration presets:** 15s / 30s / 60s. Slide count adapts (curation `targetCount`
   derives from preset: ~1.8–2.5s per slide + cover + outro).
7. **Entry point:** the Auto Montage Preview gets a format toggle — **Carousel | Reel** —
   sharing the same recipe (`montageStore`), so Shuffle re-seeds both. Export = video file
   download + Web Share (two-tap, gesture rule in CLAUDE.md).

**Validate & preview (R1):**
- Unit: `buildReelDoc` (slide count per preset, deterministic per album seed, normalizes
  round-trip), Ken Burns interpolation (t=0 → start rect, t=1 → end rect, monotonic,
  focal-safe bounds), transition timing windows (non-overlapping, sum to duration).
- Parity (Layer 4): player frame vs `drawReelFrame` at t = {cover mid, slide mid,
  transition mid, outro mid} — 4 side-by-side pairs, Read all.
- Smoke `smoke-reel.mjs`: Home → Auto Montage with 3 photos → toggle Reel → player
  visibly animating (two canvas screenshots 500ms apart must differ) → Export → download
  is video mime, size > 100KB for 15s, duration within ±10% (Layer 3 load-back), 1080×1920.
- Frame sampling (Layer 3): 5 frames Read as images; frame-diff proves Ken Burns motion
  inside one slide.
- Eyeball: all 5 vibes' reel covers (ink/font/bg must look intentional in motion, not
  just in stills).

# Batch R2 — Soundtrack & beat-cut pacing 🎵

A reel without music feels dead; cuts on beat feel professional. Stays offline: the user
supplies the audio file (their own music), nothing is fetched.

1. **Audio import:** file picker (`audio/*`) in the reel preview; store in Dexie blobs like
   photos (new Dexie `version(4)` block — never edit existing versions).
2. **On-device beat grid:** decode via `OfflineAudioContext`, compute onset/energy flux →
   estimated BPM + beat timestamps. Pure math on the sample buffer
   (`src/lib/audio/beats.ts`), tested against synthetic click tracks.
3. **Cut-on-beat:** `buildReelDoc` accepts a beat grid and snaps slide boundaries to beats
   (nearest beat within ±350ms; longer holds on the cover/best-quality shots).
4. **Muxed export:** feed the audio into the MediaRecorder stream
   (`AudioContext.createMediaElementSource` → `MediaStreamAudioDestinationNode`, add track
   to the canvas stream). Trim/loop to reel duration with a 1s fade-out.
5. **No-music fallback:** without audio, pace by a vibe-default BPM (moody ≈ slow 76,
   vibrant ≈ 120) so pacing still varies by vibe.

**Validate & preview (R2):**
- Unit: beat grid on a synthetic 120 BPM click track → detected BPM 120±2, beats within
  ±20ms; cut-snapping (slides land on beats, cover hold respected, degenerate grids —
  0/1 beats — fall back cleanly).
- Smoke: generate a tone/click WAV in-page (WebAudio → `OfflineAudioContext` render →
  WAV bytes — the pattern for in-page media generation exists in `smoke-motion.mjs`),
  attach it, export; assert audio track present (Layer 3 audio checks) and
  with-audio size > video-only size.
- Eyeball/ear-proxy: sample frames at two consecutive detected beats — the slide index
  must change ON the beat frame, not mid-hold.
- Verify the audio file never leaves the device: grep the diff for fetch/XHR; smoke runs
  with network idle (any runtime request to a non-local origin fails the suite).

# Batch R3 — Smart framing (face/saliency-aware crops) 🧠

Automated crops currently center; stunning montages frame their subjects.

1. **Focal point per photo:** reuse the existing face detection from
   `src/lib/seamAssist.ts` (run on THUMBS, sequential scan like `useCurationScan`); when no
   face, fall back to a pure saliency heuristic (edge-energy / entropy grid on the 320px
   thumb). Cache on `PhotoRecord.scores.focal = {x, y}` (unindexed, no migration).
2. **Apply everywhere automated cropping happens:** `coverCrop` gains an optional focal
   bias (pure, shared by Konva + export — parity); `autoLayout`'s dump placement prefers
   keeping focal points inside panels (seam-safe by construction — keep the property test);
   Ken Burns start/end windows anchor on the focal point (pan *toward* the subject).
3. **Cover shot choice:** the montage/reel cover picks the highest `quality × has-face`
   photo instead of the first chronological one.

**Validate & preview (R3):**
- Unit: focal-biased `coverCrop` (focal point stays inside the visible window across all
  aspects; nil focal ≡ current behavior — byte-identical output, this is a
  no-regression guarantee); saliency grid determinism; Ken Burns end-window contains
  focal.
- Visual A/B (the batch's whole point is visible): build the SAME doc with focal bias
  off vs on using a synthetic image with an obvious off-center subject (draw a bright
  square on a dark canvas in-page); screenshot both; Read them — the subject must be
  framed in the "on" version and clipped/centered-away in the "off" version.
- Smoke: import photos → auto montage → no errors with scores lacking `focal`
  (old cached scores!) — backward compat is the regression risk here.
- Parity: focal-biased crop in Konva vs export (Layer 4 pair).

# Batch R4 — Story arc & semantic intelligence (optional CLIP, previously deferred) 📖

Make the *ordering* feel narrated, not just chronological.

1. **Heuristic story arc first (no ML):** order picks as establishing shot (widest scene,
   low face count) → clusters by time/place (the trail already exists in `computeRecapStats`)
   → people/detail alternation → strongest warm/golden shot as finale. Pure re-ranker
   `storyOrder(picks)` after `curateAlbum`, tested.
2. **Optional on-device CLIP** (behind a lazy-loaded, user-invoked "Enhance picks" action —
   NEVER on the default path, and the model must ship in the bundle/precache, no runtime
   fetch): image embeddings → better vibe labels, semantic dedupe, prompt-anchored
   highlights ("sunset", "food", "friends"). If bundle size is prohibitive (>8MB), skip
   CLIP entirely and stop at the heuristic arc — an acceptable terminal state.
3. **Captions from metadata:** day-N chips ("Day 3"), date + distance stats from GPS
   clusters (offline reverse-geocode is impossible — never fake place names).

**Validate & preview (R4):**
- Unit: `storyOrder` determinism; arc-shape properties (first pick has min face count /
  max scene-width proxy; last pick is the warm-hue max; no pick lost or duplicated —
  it's a permutation).
- Bundle budget: after build, assert main chunk growth <15% vs the recorded baseline
  (write the baseline size into the check when you create it); if CLIP ships, it must be
  a separate lazy chunk — verify with `ls -la dist/assets` and that the main chunk is
  unchanged ±5%.
- Eyeball: one full reel with arc ordering — frames sampled start→finish must *read* like
  a story (establishing wide → details → finale), which only a human-style read of the
  sampled frames can judge. Do that read.

# Batch R5 — Preview & editing polish for reels ✨

1. **Full-screen story player** in Preview: 9:16 letterboxed, tap-right/left to skip,
   progress ticks like IG stories, scrub bar.
2. **Slide strip:** thumbnail rail under the player — drag to reorder, tap to swap the
   photo (from rejected picks), long-press to remove; all through the recipe so Shuffle
   respects manual locks (`locked: photoId[]` on the recipe).
3. **Theme picker chips** (the 5 vibes) + editable cover title inline in Preview — no
   editor round-trip for the two most-wanted tweaks.
4. **Motion presets per vibe** for text: cover title fade/track-in, caption slide-up;
   implemented in `drawReelFrame` (export) and the preview player identically.

**Validate & preview (R5):**
- Smoke drives the player like a user: play → screenshot; tap-right → progress tick
  advances (assert on the ticks' DOM state, not a timer); reorder via drag (Playwright
  `dragTo`) → slide order in the recipe changed; retitle inline → cover text updates in
  the NEXT player frame screenshot; export still green after all of it.
- Eyeball set: player chrome at rest / mid-scrub / with strip open; every vibe chip
  applied (5 screenshots — chip state AND cover restyle must both be visible).
- Regression: Shuffle after a manual lock keeps locked photos (unit on the recipe logic +
  smoke assertion).
- Touch targets: every new control ≥44px — measure `boundingBox()` in the smoke, don't
  eyeball-only.

# Batch R6 — Ship-quality hardening 🚢

1. **Export speed:** if realtime capture proves painful for 60s reels, add a WebCodecs
   `VideoEncoder` fast path (feature-detected; bundle an MIT muxer like `mp4-muxer` at
   build time) with MediaRecorder as the universal fallback. Target: 60s reel in <20s on
   desktop, realtime on iOS.
2. **Perf pass:** decode budget for 9:16 full-bleed slides (`neededDecodeScale`), memory
   ceiling on iPhone (20-photo reel must not OOM), Lighthouse PWA ≥ 95.
3. **Onboarding:** first-run demo album (bundled sample photos) so the hero button works
   in 5 seconds at first launch; 3-frame coach marks max.
4. **Share presets:** "Instagram Story / Reel / TikTok" naming + correct container/codec
   per target; Web Share Level 2 file share where available.
5. Docs: update `CLAUDE.md` invariants with the reel renderer parity rule + audio notes;
   bump test counts.

**Validate & preview (R6):**
- Timed export benchmark in the smoke (log wall-clock for a 15s reel; fail if > 2× the
  batch's recorded baseline — catches silent perf regressions forever after).
- WebCodecs path and MediaRecorder path BOTH exercised (force the fallback by stubbing
  `VideoEncoder` to undefined in an init script) — same duration/dimension assertions on
  both outputs, sampled frames from both Read and compared.
- Onboarding: fresh-profile smoke (`welcomed: false`, empty IndexedDB) → demo album
  present → hero tap → a finished preview within a generous timeout, zero errors — this
  IS the 5-second first-run promise, tested literally.
- Memory: 20-photo reel export under a `page.metrics()` / heap snapshot ceiling; log it.

---

## Standing rules for every batch

- **Order is priority order.** R1 unblocks the product promise; don't start R4/R5 before
  R1 ships. Within a batch, ship increments that keep `main` releasable.
- **The gate is non-negotiable** and the playbook layers 2–5 are part of the gate for
  anything user-visible. If you claim "verified", the transcript must contain the
  screenshots/frames you Read and the live-hash check.
- **Deploy discipline:** push `main` (Pages deploys from default branch only), sync the
  working branch `claude/montage-studio-collage-carousel-he4b9g`, verify the live bundle
  hash at https://carlob2499.github.io/Montage/ matches local `dist/assets/index-*.js`,
  and report the link.
- **Offline is identity:** no runtime network calls, ever. Anything ML ships in the bundle
  or doesn't ship.
- **Both render paths or neither** (invariant #2) — a visual feature that exists only in
  preview or only in export is a bug, not a partial feature.
- **iOS is the floor.** Re-read the Mobile/iOS constraints section of `CLAUDE.md` before
  touching canvas, video, or export code. Every media `await` is timeout-bounded.
- **Throwaway validation scripts live in the scratchpad**, never committed; permanent
  checks graduate into `src/**/*.test.ts` or `scripts/smoke/`.
