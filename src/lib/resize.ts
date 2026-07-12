// ---------------------------------------------------------------------------
// One-click resize: re-flow a whole project to a new panel size/aspect by
// proportionally rescaling every layer, then re-running seam safety. Pure and
// unit-tested.
//
// Note: when sx !== sy (e.g. 4:5 → 16:9) the transform is anisotropic, so a
// ROTATED layer's bbox drifts slightly — seam warnings are advisory and the
// re-nudge pass corrects the common (unrotated text/subject) cases.
// ---------------------------------------------------------------------------

import type { Layer, ProjectDoc } from '../types';
import { geometryOf, rotatedBBox } from './slicer';
import { SEAM_MARGIN, suggestNudge } from './seamAssist';

/** rough axis-aligned bbox of a layer for the seam re-nudge (no Konva). */
function layerBox(layer: Layer): { x: number; y: number; width: number; height: number } {
  if (layer.type === 'text') {
    const lines = layer.text.split('\n');
    const longest = Math.max(...lines.map((l) => l.length), 1);
    const width = layer.width ?? layer.fontSize * longest * 0.55;
    const height = layer.fontSize * layer.lineHeight * lines.length;
    return rotatedBBox({ x: layer.x, y: layer.y, width, height }, layer.rotation);
  }
  return rotatedBBox(
    { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
    layer.rotation,
  );
}

export function resizeDoc(
  doc: ProjectDoc,
  panelWidth: number,
  panelHeight: number,
  aspect: string,
): ProjectDoc {
  // grid tiles are always square
  const targetH = doc.mode === 'grid' ? panelWidth : panelHeight;
  const from = geometryOf(doc);
  const sx = panelWidth / from.panelWidth;
  const sy = targetH / from.panelHeight;

  let layers: Layer[] = doc.layers.map((l) => {
    const base = { ...l, x: l.x * sx, y: l.y * sy };
    switch (base.type) {
      case 'text':
        return {
          ...base,
          fontSize: base.fontSize * sy,
          letterSpacing: base.letterSpacing * sx,
          width: base.width !== undefined ? base.width * sx : undefined,
        };
      case 'photo':
        return {
          ...base,
          width: base.width * sx,
          height: base.height * sy,
          cornerRadius: base.cornerRadius * ((sx + sy) / 2),
        };
      case 'card':
        return {
          ...base,
          width: base.width * sx,
          height: base.height * sy,
          cornerRadius: base.cornerRadius * ((sx + sy) / 2),
        };
      case 'sticker':
        return { ...base, width: base.width * sx, height: base.height * sy };
    }
  });

  // re-nudge text + flagged subjects clear of the (now moved) seams
  if (doc.mode === 'carousel') {
    layers = layers.map((l) => {
      const isSubject = l.type === 'photo' && l.isSubject;
      if (l.type !== 'text' && !isSubject) return l;
      const dx = suggestNudge(layerBox(l), doc.panelCount, panelWidth, SEAM_MARGIN);
      return dx && Number.isFinite(dx) ? { ...l, x: l.x + dx } : l;
    });
  }

  return {
    ...doc,
    aspect: doc.mode === 'grid' ? '1:1' : aspect,
    panelWidth,
    panelHeight: targetH,
    margin: doc.margin * ((sx + sy) / 2),
    gutter: doc.gutter * sx,
    layers,
  };
}
