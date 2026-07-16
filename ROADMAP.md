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

## Batch R1 — Story Reel engine (the core gap) 🎬

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
   WebM where supported; on iOS Safari MediaRecorder yields MP4 (H.264) natively — feature-
   detect `MediaRecorder.isTypeSupported` and pick the best of
   `video/mp4;codecs=avc1` → `video/webm;codecs=vp9` → `video/webm`.
6. **Duration presets:** 15s / 30s / 60s. Slide count adapts (curation `targetCount`
   derives from preset: ~1.8–2.5s per slide + cover + outro).
7. **Entry point:** the Auto Montage Preview gets a format toggle — **Carousel | Reel** —
   sharing the same recipe (`montageStore`), so Shuffle re-seeds both. Export = video file
   download + Web Share (two-tap, gesture rule in CLAUDE.md).

*Gate:* pure tests for reel doc build/normalize/Ken Burns interpolation/transition timing;
a smoke suite that generates a reel from 3 images and asserts a non-trivial video download.

## Batch R2 — Soundtrack & beat-cut pacing 🎵

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

*Gate:* beat-grid unit tests (synthetic 120 BPM click → ±20ms accuracy); smoke asserts a
reel export with an attached generated tone still downloads and is larger than video-only.

## Batch R3 — Smart framing (face/saliency-aware crops) 🧠

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

*Gate:* pure tests for focal-biased coverCrop (focal stays in frame across aspect
changes), saliency grid determinism, and Ken Burns focal anchoring.

## Batch R4 — Story arc & semantic intelligence (optional CLIP, previously deferred) 📖

Make the *ordering* feel narrated, not just chronological.

1. **Heuristic story arc first (no ML):** order picks as establishing shot (widest scene,
   low face count) → clusters by time/place (the trail already exists in `computeRecapStats`)
   → people/detail alternation → strongest warm/golden shot as finale. Pure re-ranker
   `storyOrder(picks)` after `curateAlbum`, tested.
2. **Optional on-device CLIP** (behind a lazy-loaded, user-invoked "Enhance picks" action —
   NEVER on the default path, and the model must ship in the bundle/precache, no runtime
   fetch): image embeddings → better vibe labels, semantic dedupe ("6 photos of the same
   dish"), and prompt-anchored highlights ("sunset", "food", "friends"). If bundle size is
   prohibitive (>8MB), skip CLIP entirely and stop at the heuristic arc — that's an
   acceptable terminal state for this batch.
3. **Captions from metadata:** day-N chips ("Day 3"), place-ish labels from GPS clusters
   (offline reverse-geocode is impossible — use "Day N" + date + distance stats instead;
   never fake place names).

*Gate:* `storyOrder` determinism + arc-shape property tests; bundle-size budget assertion
in CI (fail if main chunk grows >15% in one batch).

## Batch R5 — Preview & editing polish for reels ✨

1. **Full-screen story player** in Preview: 9:16 letterboxed, tap-right/left to skip,
   progress ticks like IG stories, scrub bar.
2. **Slide strip:** thumbnail rail under the player — drag to reorder, tap to swap the
   photo (from rejected picks), long-press to remove; all through the recipe so Shuffle
   respects manual locks (`locked: photoId[]` on the recipe).
3. **Theme picker chips** (the 5 vibes) + editable cover title inline in Preview — no
   editor round-trip for the two most-wanted tweaks.
4. **Motion presets per vibe** for text: cover title fade/track-in, caption slide-up;
   implemented in `drawReelFrame` (export) and the preview player identically.

*Gate:* smoke drives the player (play, skip, reorder, retitle, export).

## Batch R6 — Ship-quality hardening 🚢

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

---

## Standing rules for every batch

- **Order is priority order.** R1 unblocks the product promise; don't start R4/R5 before
  R1 ships. Within a batch, ship increments that keep `main` releasable.
- **The gate is non-negotiable:** `npx tsc -b --noEmit` && `npm test` && `npm run build`
  && `npm run smoke` before any push. Every bug fix lands with a regression test where the
  logic is pure; new features get a smoke path.
- **Deploy discipline:** push `main` (Pages deploys from default branch only), sync the
  working branch `claude/montage-studio-collage-carousel-he4b9g`, then verify the live
  bundle hash at https://carlob2499.github.io/Montage/ matches local `dist/assets/index-*.js`.
- **Offline is identity:** no runtime network calls, ever. Anything ML ships in the bundle
  or doesn't ship.
- **Both render paths or neither** (invariant #2) — a visual feature that exists only in
  preview or only in export is a bug, not a partial feature.
- **iOS is the floor.** Re-read the Mobile/iOS constraints section of `CLAUDE.md` before
  touching canvas, video, or export code.
