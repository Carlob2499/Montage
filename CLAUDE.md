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
- Dexie is at version(2) (`styles` table). New tables/indexes = a new version() block,
  never edit an existing one.
- `autoLayout` (photo dump / recap) is seeded and pure — 'dump' style must stay seam-safe
  by construction (property test in `autoLayout.test.ts`).
- New Adjustments fields need: NEUTRAL_ADJUSTMENTS default + `normalizeAdjustments` covers
  old stored stacks automatically + a slider in ADJUSTMENT_DEFS.
- Web Share flow is two-tap (render → share) because navigator.share must be called
  synchronously inside a user gesture.

## Testing expectations

Every bug fix lands with a regression test where the logic is pure (`src/lib`,
`src/state`). UI-level fixes get covered by the smoke scripts. Current suite: 127 tests.
