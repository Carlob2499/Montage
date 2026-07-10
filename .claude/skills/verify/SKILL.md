---
name: verify
description: Verify a Montage Studio change end-to-end — unit tests, typecheck, production build, and headless-browser smoke tests that exercise import → canvas → export for real.
---

# Verifying changes in Montage Studio

Tests passing is necessary but NOT sufficient here: the editor (Konva) and the
export renderer are separate code paths that must visually agree, and several
past bugs (FileList clearing, blank exports, transformer races) only reproduce
in a real browser. Always finish with the smoke suite.

## Steps

1. `npm test` — 91+ Vitest tests (slicing math, edit stacks, EXIF sort,
   template/project schema, undo semantics). Pure-logic changes need a new
   test here first.
2. `npx tsc -b --force` — strict typecheck.
3. `npm run build` — production build (also validates the PWA precache).
4. `npm run smoke` — starts `vite preview` on :4173 if needed and runs:
   - `scripts/smoke/smoke-ui.mjs` — project → template → text → sheets →
     swipe preview → persistence.
   - `scripts/smoke/smoke-pipeline.mjs` — imports a real PNG through the file
     input, places it, applies a preset, exports, and asserts the file is a
     4320×1350 JPEG (pixel-exact panel math).

   Chromium resolution: `$CHROMIUM_PATH` → `$PLAYWRIGHT_BROWSERS_PATH` /
   `/opt/pw-browsers` → PATH. Do NOT run `playwright install`.

## What to eyeball beyond the scripts

- Anything touching `src/lib/renderer.ts` or the Konva nodes: screenshot the
  editor AND export the same project — they must match (text width/alignment,
  letter spacing, crops, backgrounds).
- Anything touching seams (`slicer.ts`, photo sub-rect rendering, sharpen or
  vignette): export two adjacent panels of a spanning photo and compare the
  edge columns — they must be pixel-continuous.
- Undo changes: one slider drag = ONE undo step; typing a caption then ⌘Z
  restores the pre-typing text.

## Known verification traps

- The dev server masks PWA/service-worker behavior — always smoke against the
  production build (`vite preview`).
- iOS-specific failures (canvas >16.7MP, `ctx.filter`, `<a download>` limits)
  cannot be reproduced in desktop Chromium; re-read the "Mobile/iOS
  constraints" section of CLAUDE.md before touching export code.
