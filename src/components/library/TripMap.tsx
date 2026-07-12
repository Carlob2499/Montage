import { useMemo, useState } from 'react';
import { useBlobUrl } from '../../hooks/useBlobUrl';
import { projectPoints, clusterPoints } from '../../lib/geoMap';
import { haversineKm } from '../../lib/recap';
import type { PhotoRecord } from '../../types';

const W = 360;
const H = 440;

export default function TripMap({
  photos,
  onClose,
}: {
  photos: PhotoRecord[];
  onClose: () => void;
}) {
  const [sel, setSel] = useState<number[] | null>(null);

  // located photos, chronological (for the trail)
  const located = useMemo(
    () =>
      photos
        .filter((p): p is PhotoRecord & { gps: { lat: number; lng: number } } => !!p.gps)
        .sort((a, b) => (a.dateTaken ?? a.dateAdded) - (b.dateTaken ?? b.dateAdded)),
    [photos],
  );

  const pts = useMemo(() => projectPoints(located.map((p) => p.gps), W, H, 30), [located]);
  const clusters = useMemo(() => clusterPoints(pts, 22), [pts]);

  const km = useMemo(() => {
    let d = 0;
    for (let i = 1; i < located.length; i++) d += haversineKm(located[i - 1].gps, located[i].gps);
    return d;
  }, [located]);

  const trail = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const selPhotos = sel ? sel.map((i) => located[i]) : [];

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/50" onClick={onClose} />
      <div className="sheet z-40 p-4 md:inset-auto md:left-1/2 md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Trip map</h3>
            <p className="text-xs text-ink-400">
              {located.length} located · {Math.round(km)} km wandered
            </p>
          </div>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="overflow-hidden rounded-xl bg-ink-950">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Map of photo locations">
            <rect width={W} height={H} fill="#0b1020" />
            {/* subtle graticule */}
            {[0.25, 0.5, 0.75].map((f) => (
              <g key={f} stroke="#1e293b" strokeWidth={1}>
                <line x1={0} y1={H * f} x2={W} y2={H * f} />
                <line x1={W * f} y1={0} x2={W * f} y2={H} />
              </g>
            ))}
            {/* chronological trail */}
            {pts.length > 1 && (
              <polyline
                points={trail}
                fill="none"
                stroke="#f472b6"
                strokeWidth={1.5}
                strokeOpacity={0.5}
                strokeLinejoin="round"
              />
            )}
            {/* clusters */}
            {clusters.map((c, i) => {
              const active = sel && sel === c.indices;
              const r = 6 + Math.min(14, Math.sqrt(c.indices.length) * 4);
              return (
                <g key={i} className="cursor-pointer" onClick={() => setSel(c.indices)}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={r}
                    fill={active ? '#f472b6' : '#38bdf8'}
                    fillOpacity={0.85}
                    stroke="#e0f2fe"
                    strokeWidth={1}
                  />
                  {c.indices.length > 1 && (
                    <text
                      x={c.x}
                      y={c.y + 4}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight="bold"
                      fill="#08131f"
                    >
                      {c.indices.length}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {sel && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium text-ink-400">
              {selPhotos.length} photo(s) here
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {selPhotos.map((p) => (
                <MapThumb key={p.id} photo={p} />
              ))}
            </div>
          </div>
        )}
        <p className="mt-2 text-[11px] text-ink-400">
          Fully offline — plotted from your photos' GPS, no map is downloaded.
        </p>
      </div>
    </>
  );
}

function MapThumb({ photo }: { photo: PhotoRecord }) {
  const url = useBlobUrl('thumbs', photo.id);
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-ink-800">
      {url && <img src={url} alt={photo.fileName} className="h-full w-full object-cover" />}
    </div>
  );
}
