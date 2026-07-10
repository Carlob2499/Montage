# Montage Studio

A personal photo-collage and **seamless Instagram-carousel** maker. Compose one continuous
panoramic canvas; Montage slices it into pixel-perfect 1080×1350 / 1080×1080 / 1080×1920 panels
with content flowing across the slice boundaries. Everything runs on-device as a static PWA —
no backend, no accounts, no analytics, photos never leave your browser.

## Quick start

```bash
npm install
npm run dev        # dev server
npm test           # vitest suite (slicing math, edit stacks, EXIF sort, template schema)
npm run build      # production build to dist/
npm run preview    # serve the production build locally
```

## Deploying to GitHub Pages

The included workflow (`.github/workflows/deploy.yml`) builds and deploys on every push to
`main`. One-time setup: repo **Settings → Pages → Source → GitHub Actions**. The app then lives
at `https://<user>.github.io/Montage/` and can be installed to your phone's home screen
(it works fully offline after the first load).

## What's inside

| Area | Details |
| --- | --- |
| Library | Albums (rename/merge/delete), drag-drop import, JPEG/PNG/WebP/HEIC + short MP4/WebM, EXIF date sort, tags + search, multi-select batch move/tag/delete, duplicate detection, storage meter |
| Editing | Non-destructive stacks: exposure, contrast, highlights/shadows, saturation, vibrance, temperature/tint, sharpness, vignette; crop/rotate/flip; 12+ original presets; copy/paste edits across an album |
| Canvas | Freeform place/scale/rotate/layer with snapping + alignment guides, structured 2–12 cell grids, 30 original templates (JSON schema — add your own in `src/templates/templates.ts`), text tool with 5 bundled open-license fonts, solid/gradient/blurred-photo backdrops, sticker PNG overlays |
| Carousel | Live seam guides, seam-safety warnings for text/subjects on slice lines, swipe-simulation preview, panel reorder/insert/delete, per-panel captions, >10 panels supported (up to 20) |
| Profile grid | 3×N planner with tiles exported in correct upload order (bottom-right first) |
| Export | PNG/JPEG (quality slider) at exact Instagram-native sizes, sRGB, single panel / numbered files / ZIP with captions.txt, full-res panorama |
| Projects | IndexedDB save/load, 30s + on-blur autosave, duplication, JSON export/import backup |

### HEIC

iPhone HEIC files are converted on import via a lazily-loaded WASM decoder (only downloaded the
first time you import a HEIC). If a file can't be decoded you get a clear per-file error instead
of a silent failure.

### Video (stubbed)

Short MP4/WebM clips can be imported and placed in cells — they render and export as their
poster frame for now. True muted-loop video cells and MP4 panel export are planned; the UI
labels them clearly.

### Keyboard shortcuts

Arrows nudge (Shift = 10px) · ⌘/Ctrl-Z undo, ⇧⌘Z redo (50 steps) · ⌘/Ctrl-D duplicate ·
Delete/Backspace removes · double-click/tap opens a layer's editor. On touch: pinch to zoom,
one-finger pan on empty canvas, long-press a library photo for multi-select.

## Architecture notes

- **Slicing** is pure math in `src/lib/slicer.ts` — panels are rendered by translating the
  continuous canvas per panel, so seams are seamless by construction and no giant full-canvas
  bitmap is ever allocated.
- **Edits** are parameter stacks stored per photo (`src/lib/editStack.ts`); the same pixel
  function drives the live Konva filter, preset thumbnails, and full-res export.
- **Performance**: editing uses ≤1600px proxies and capped Konva filter caches; exports decode
  originals fresh and release them immediately.
- Icons are generated dependency-free by `scripts/gen-icons.mjs` (hand-assembled PNG chunks).

All templates, presets, icons and UI are original work. Bundled fonts (Inter, Playfair Display,
Space Grotesk, Lora, Caveat) are SIL OFL licensed and self-hosted in `public/fonts`.
