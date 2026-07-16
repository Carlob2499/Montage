import { useEffect, useRef, useState } from 'react';
import type { ReelDoc } from '../../lib/reel/reelDoc';
import { buildTimeline, segmentAt } from '../../lib/reel/reelDoc';
import { drawReelFrame } from '../../lib/reel/reelFrame';
import { loadReelResources, releaseReelResources } from '../../lib/reel/reelExport';
import type { ReelResources } from '../../lib/reel/reelFrame';

/**
 * Full-screen 9:16 reel player. Renders the SAME drawReelFrame the exporter
 * uses (preview/export parity over time) via a rAF loop. Story-style progress
 * ticks (one per segment), tap left/right to skip, tap center to play/pause.
 */
export default function ReelPlayer({ doc }: { doc: ReelDoc }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resRef = useRef<ReelResources | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  // absolute playhead in ms, driven by rAF; kept in a ref to avoid re-renders
  const tRef = useRef(0);
  const [segIndex, setSegIndex] = useState(0);
  const segs = buildTimeline(doc);
  const segCount = segs.length;

  // (re)load decoded photos whenever the reel identity changes
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    tRef.current = 0;
    setSegIndex(0);
    (async () => {
      const res = await loadReelResources(doc, true);
      if (cancelled) {
        releaseReelResources(res);
        return;
      }
      resRef.current = res;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (resRef.current) {
        releaseReelResources(resRef.current);
        resRef.current = null;
      }
    };
  }, [doc]);

  // the render loop
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const res = resRef.current;
    if (!canvas || !res) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      if (playing) {
        tRef.current += dt;
        if (tRef.current >= doc.durationMs) tRef.current = 0; // loop
      }
      drawReelFrame(ctx, doc, tRef.current, res);
      const { index } = segmentAt(segs, tRef.current);
      setSegIndex((prev) => (prev === index ? prev : index));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // segs is derived from doc; playing/ready gate the loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing, doc]);

  const skip = (dir: -1 | 1) => {
    const { index } = segmentAt(segs, tRef.current);
    const target = Math.max(0, Math.min(segCount - 1, index + dir));
    tRef.current = segs[target].startMs + 1;
    setSegIndex(target);
  };

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
      <div className="relative h-full max-h-full" style={{ aspectRatio: '9 / 16' }}>
        <canvas
          ref={canvasRef}
          width={doc.width}
          height={doc.height}
          className="h-full w-full rounded-lg object-contain"
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}

        {/* progress ticks — one per segment (cover, slides…, outro) */}
        <div className="pointer-events-none absolute inset-x-2 top-2 flex gap-1">
          {segs.map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: i < segIndex ? '100%' : i === segIndex ? '60%' : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* tap zones: left = back, center = play/pause, right = forward */}
        <div className="absolute inset-0 flex">
          <button className="h-full w-1/3" aria-label="Previous" onClick={() => skip(-1)} />
          <button
            className="h-full w-1/3"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => setPlaying((p) => !p)}
          />
          <button className="h-full w-1/3" aria-label="Next" onClick={() => skip(1)} />
        </div>

        {!playing && ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-3xl text-white">
              ▶
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
