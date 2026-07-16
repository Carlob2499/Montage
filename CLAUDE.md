# Montage Studio — project memory

Local-first PWA: photo collage + seamless Instagram-carousel maker. Vite + React + TS,
react-konva canvas, Dexie (IndexedDB), zustand, Tailwind v4. No backend, no runtime network
calls; deploys to GitHub Pages at `/Montage/` via `.github/workflows/deploy.yml`.

## Commands

- `npm run dev` / `npm run build` / `npm test` (Vitest, node env, `src/**/*.test.ts`)
- `npm run smoke` — headless-browser end-to-end tests against the production build
  (see `scripts/smoke/`); run after any change to import, canvas, or export code.
- `node scripts/gen-icons.mjs` regenerates PWA icons (dependency-free PNG writer).

## Architecture invariants — do not break these

1. **Seam continuity is the product.** Panels are rendered by translating ONE continuous
   canvas (`renderRegion` in `src/lib/renderer.ts`); content must be pixel-identical across
   slice boundaries. Anything spatial applied per-panel must be frame-aware:
   - photo layers render per-panel *sub-rects* padded by `CONTENT_PAD` so the sharpen
     convolution matches a full-frame render inside the visible area;
   - vignette AND grain take a `FrameContext` (offset within the layer frame) — grain is
     hash-noise on absolute frame coordinates, see the "sub-rect rendering (seam
     continuity)" tests in `editStack.test.ts`;
   - the blurred backdrop is rendered ONCE per export (`resources.backdropCache`) and
     sliced, never re-blurred per panel;
   - frame-style geometry (torn edges, tape strips) is deterministic per layer id
     (`src/lib/frameStyles.ts`) so Konva and export draw the same shapes.
   - **layer effects** (drop shadow on any layer; border + shape mask on photos/cards) share
     ONE path tracer `tracePhotoOutline`/`traceMask` (`src/lib/maskShapes.ts`) across Konva and
     export. Photo shadow = an opaque silhouette drawn behind the clipped photo; the border
     strokes the clip outline at 2× width so the clip keeps a clean inset edge. New effect
     fields (shadow/stroke/maskShape) must go through `normalizeProjectDoc`.
2. **Preview/export parity.** The editor (Konva) and the export renderer are separate code
   paths that must visually agree: text metrics (`measureTextLayer` — real glyph
   measurement, per-glyph letterSpacing drawing), cover-fit math (`coverCrop` used by
   both), crop preprocessing, background painting. When adding a visual feature, implement
   BOTH paths and eyeball them against each other.
3. **Undo is gesture-scoped.** `preview()` mutates without history and snapshots
   `previewBase` on first call; `commit()`/`commitPreview()` push that base. Sliders and
   typing MUST go through `preview`/`{transient: true}` + `commitPreview` on
   pointer-up/blur (the shared `Slider` component does this automatically). Never call
   `commit()` from a per-tick `onChange`.
4. **Never trust stored/imported docs.** All project JSON goes through
   `normalizeProjectDoc` (`src/lib/projectSchema.ts`); templates through
   `validateTemplateLibrary`. Extend the normalizers when adding doc fields (and their
   tests), or malformed data white-screens the editor.
5. **Edits are parameter stacks; originals are immutable.** `applyAdjustments` is the ONE
   pixel function used by Konva filters, preset thumbnails, and export. Keep it pure and
   tested.
6. **Motion goes through the still path.** Video-in-cell playback (editor) and motion panel
   export (`src/lib/motionExport.ts`) draw the clip's CURRENT frame with the SAME `coverCrop`
   as the poster, and motion export composites through `renderRegion` — so seam continuity,
   z-order, and frame styles are identical to a still export by construction. Per-frame color
   adjustments/crop are intentionally NOT applied to a playing clip (the poster still carries
   them); keep that cheap. A live frame is fed via `RenderResources.videos` (photoId →
   `HTMLVideoElement`); `paintPhotoLayer` prefers it over the poster bitmap. Motion export is
   real-time capture (a 4s panel takes 4s). Audio passthrough is a deliberate non-goal.
7. **The Reel is a separate TEMPORAL path with its own parity rule.** A Story Reel
   (`src/lib/reel/*`) is NOT a ProjectDoc — it's a timeline of full-bleed 9:16 slides (one
   photo each, Ken Burns pan/zoom) with a cover/outro, built from the SAME montage recipe as
   the carousel (`buildReelDoc` mirrors `buildAutoMontageDoc`, reuses `VIBE_THEMES`
   ink/font/background). The parity rule (invariant #2) applies over time: ONE pure
   `drawReelFrame(ctx, reelDoc, tMs, res)` (`reelFrame.ts`) is called by BOTH the in-app
   player (`ReelPlayer.tsx`, rAF loop) and the exporter (`reelExport.ts`, `captureStream` +
   MediaRecorder, real-time) — a player/export divergence is a bug. Ken Burns feeds the SAME
   `coverCrop` the stills use (motion is expressed in zoom/pan space); motion is seeded per
   slide index so it's deterministic and Shuffle varies it. Reel docs still go through
   `normalizeReelDoc` (invariant #4). Codec is feature-detected (`pickMimeType`: MP4 on
   Safari, WebM elsewhere). MediaRecorder output has no container duration — `video.duration`
   is Infinity and `currentTime=0` decodes black; sample a frame only AFTER `play()`.
   **Soundtrack** (`src/lib/audio/*`, offline): every reel gets a procedural vibe-matched
   bed by default (`renderVibeBed` — a pad chord + kick on each beat via
   `OfflineAudioContext`, no licensing/bundle weight), muxed into the export by adding a
   `MediaStreamAudioDestinationNode` track to the capture stream. Slides are cut on the beat
   (`beatAlignedDurations`) — the vibe tempo grid by default, or a user track's detected
   beats (`detectBeats`: energy-flux + autocorrelation, pure + tested). User audio is
   session-only (in-memory `AudioBuffer`); Dexie persistence is a deferred follow-up.

## Mobile/iOS constraints (bugs already paid for)

- Canvas area limit ~16.7MP on iOS Safari → `MAX_CANVAS_AREA` cap in exporter; never
  allocate full-canvas-width bitmaps (that's why photo content renders in sub-rects).
- `ctx.filter` (blur) unsupported until Safari 18; `ctx.letterSpacing` until 17.4 —
  both have manual fallbacks in the renderer (downscale-blur; per-glyph drawing).
- Decode originals with `createImageBitmap` resize (`neededDecodeScale`) — full-res
  decoding of 20 photos OOMs iPhones.
- Multiple programmatic `<a download>` clicks get dropped on mobile → ZIP is the reliable
  multi-file path; separate downloads are staggered 400ms.
- Video elements need `playsInline`, `preload='auto'`, and every await bounded by a
  timeout (`videoPoster` in `importPhotos.ts`) or imports hang forever on iOS.
- `<video preload="metadata">` never reaches HAVE_CURRENT_DATA on iOS.
- iOS Safari drops video elements past a low simultaneous-play ceiling → only the first
  ~8 video layers autoplay in the editor (`MAX_CONCURRENT_VIDEOS` in `CanvasStage`); the
  rest hold their poster. The global `motion` toggle (`uiStore`) freezes all clips.

## Recurring JS/React gotchas hit in this codebase

- `FileList` is LIVE: materialize `Array.from(input.files)` BEFORE `input.value = ''`.
- `useLiveQuery` returns `undefined` both while loading and for missing rows, and can
  briefly return the previous deps' value after deps change → tag results with their key
  (see PhotoEditSheet's `{ id, row }` pattern) and use `?? null` sentinels.
- Konva: filters require `node.cache()`; `blurRadius` operates in cached-bitmap pixels
  (scale by the cache `pixelRatio`). Transformer holds dead refs across remounts — the
  attach effect re-resolves nodes every render and diffs identity.
- Gesture handlers must use functional `setState` — two touchmoves can land between
  renders and a captured `view` drops deltas.
- JPEG encoding drops alpha to BLACK: keep PNG for alpha sources (`makeScaledImage`).
- Dexie: multi-step deletes must live in ONE transaction; clearing a table doesn't stop
  an in-memory autosave from writing back (close the project first).
- Layer nodes are `React.memo`ed; keep layer object identity stable for untouched layers
  in store updates (map-and-replace only patched ids).

## Other load-bearing decisions

- The service worker is CUSTOM (`src/sw.ts`, vite-plugin-pwa `injectManifest`) — it
  handles the Android share-target inbox. Don't switch back to `generateSW`.
- Dexie is at version(3) (`snapshots` table). New tables/indexes = a new version() block,
  never edit an existing one. Booleans aren't valid IndexedDB keys — `PhotoRecord.favorite`
  is intentionally UNINDEXED (favorites are filtered from the loaded album array).
- **Persistent revision snapshots** are separate from in-memory undo. `projectStore.save()`
  (the 30s autosave throttle point) captures a durable snapshot of the whole ProjectDoc JSON
  (no pixels — layers are photoId refs) via `snapshotProject`, throttled ≥60s and capped 15/
  project (`src/lib/snapshotPolicy.ts`). `restoreSnapshot` snapshots the current state first
  (reversible) and round-trips through `normalizeProjectDoc`. The `past`/`future` undo stack
  is untouched. Prune on project delete (`deleteProjectSnapshots`).
- **Trip map is offline** (`src/lib/geoMap.ts` `projectPoints`/`clusterPoints`, pure+tested;
  `TripMap.tsx`) — plots `PhotoRecord.gps` on a canvas with equirectangular projection
  (cos(meanLat) longitude scaling), NO map tiles/network. Reuses `haversineKm`.
- `autoLayout` (photo dump / recap) is seeded and pure — 'dump' style must stay seam-safe
  by construction (property test in `autoLayout.test.ts`).
- New Adjustments fields need: NEUTRAL_ADJUSTMENTS default + `normalizeAdjustments` covers
  old stored stacks automatically + a slider in ADJUSTMENT_DEFS.
- Web Share flow is two-tap (render → share) because navigator.share must be called
  synchronously inside a user gesture.
- **On-device curation** (`src/lib/curation/*`, all pure + tested): quality/vibe/phash
  scores are computed off the 320px THUMB (never originals) and cached unindexed on
  `PhotoRecord.scores` (no Dexie migration). `useCurationScan` mirrors `useFaceScan`
  (sequential, scan-once, yields). `curateAlbum` (dedup → quality floor → vibe → greedy MMR
  diversity) is pure; Auto Montage feeds its picks through `buildAutoMontageDoc` →
  `buildRecapDoc` (extended with a bg/frame/seed override) and the SAME
  recap→editor path. Everything here stays 100% offline. Advisory, never destructive —
  the user always gets an editable draft and can override the detected vibe.
- **One-tap Auto Montage** (`createMontageFromFiles` in `src/lib/curation/autoMontageFlow.ts`)
  is the flagship zero-edit path: a Home hero takes a photo dump → new album → import → score
  → `curateAlbum` → `buildAutoMontageDoc` → lands in **Preview** (not the editor) with
  Shuffle/Edit/Export. `montageStore` holds the recipe (album+picks+vibe+docId) so Shuffle
  rebuilds from the SAME best-shot picks with a new seed/vibe (no re-import/re-score);
  `recipe.docId === doc.id` gates the montage UI so a stale recipe never leaks onto another
  project. Export from Preview is a direct panels→ZIP save (no editor round-trip).

## Testing expectations

Every bug fix lands with a regression test where the logic is pure (`src/lib`,
`src/state`). UI-level fixes get covered by the smoke scripts. Current suite: 237 tests.
