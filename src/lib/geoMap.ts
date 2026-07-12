// ---------------------------------------------------------------------------
// Pure projection + clustering for the offline "trip map". No tiles, no
// network — just plot the GPS points of an album onto a canvas, fit to their
// bounding box with correct geographic aspect. Unit-tested.
// ---------------------------------------------------------------------------

export interface LatLng {
  lat: number;
  lng: number;
}
export interface Pt {
  x: number;
  y: number;
}
export interface Cluster {
  x: number;
  y: number;
  /** indexes into the input points array */
  indices: number[];
}

/**
 * Project lat/lng points into `w`×`h` screen space (y grows downward, north
 * up), fit to their bounding box inside `pad`, preserving geographic aspect
 * (equirectangular with cos(meanLat) longitude scaling). A single point — or a
 * degenerate (zero-span) bbox — lands centered.
 */
export function projectPoints(pts: LatLng[], w: number, h: number, pad = 24): Pt[] {
  if (pts.length === 0) return [];
  const meanLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const kx = Math.max(1e-6, Math.cos((meanLat * Math.PI) / 180));
  // geographic plane: x east (scaled), y south (so north is up on screen)
  const proj = pts.map((p) => ({ x: p.lng * kx, y: -p.lat }));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of proj) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const rawSpanX = maxX - minX;
  const rawSpanY = maxY - minY;
  // guard the scale divisor, but center using the REAL span so a single point
  // (or a one-axis-degenerate bbox) lands centered rather than pinned to pad
  const spanX = rawSpanX || 1;
  const spanY = rawSpanY || 1;
  const availW = Math.max(1, w - 2 * pad);
  const availH = Math.max(1, h - 2 * pad);
  const scale = Math.min(availW / spanX, availH / spanY);
  const offX = pad + (availW - rawSpanX * scale) / 2;
  const offY = pad + (availH - rawSpanY * scale) / 2;
  return proj.map((p) => ({ x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale }));
}

/**
 * Greedy screen-space clustering: points within `radius` px of a cluster's
 * running centroid merge into it. Returns clusters with their centroid and the
 * indexes of the points they contain.
 */
export function clusterPoints(pts: Pt[], radius: number): Cluster[] {
  const clusters: Cluster[] = [];
  pts.forEach((p, i) => {
    let best: Cluster | null = null;
    let bestD = radius;
    for (const c of clusters) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d <= bestD) {
        best = c;
        bestD = d;
      }
    }
    if (best) {
      const n = best.indices.length;
      best.x = (best.x * n + p.x) / (n + 1);
      best.y = (best.y * n + p.y) / (n + 1);
      best.indices.push(i);
    } else {
      clusters.push({ x: p.x, y: p.y, indices: [i] });
    }
  });
  return clusters;
}
