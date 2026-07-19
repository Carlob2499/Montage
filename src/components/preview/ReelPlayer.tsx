import { useEffect, useRef, useState } from 'react';
import type { ReelDoc } from '../../lib/reel/reelDoc';
import { buildTimeline, segmentAt } from '../../lib/reel/reelDoc';
import { drawReelFrame } from '../../lib/reel/reelFrame';
import { loadReelResources, releaseReelResources } from '../../lib/reel/reelExport';
import { renderVibeBed } from '../../lib/audio/synth';
import type { ReelResources } from '../../lib/reel/reelFrame';

/**
 * Full-screen 9:16 reel player. Renders the SAME drawReelFrame the exporter
 * uses (preview/export parity over time) via a rAF loop. Story-style progress
 * ticks (one per segment), tap left/right to skip, tap center to play/pause.
 */
export default function ReelPlayer({
  doc,
  muted = false,
  audioBuffer = null,
}: {
  doc: ReelDoc;
  muted?: boolean;
  audioBuffer?: AudioBuffer | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resRef = useRef<ReelResources | null>(null);
  const bedRef = useRef<AudioBuffer | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // the video element currently being played (a video slide is on screen)
  const curVidRef = useRef<HTMLVideoElement | null>(null);
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
      // drive live clip playback so a video slide MOVES (matches the export):
      // play the active clip, pause any other, reset on segment change
      const { index, seg } = segmentAt(segs, tRef.current);
      if (res.videos && res.videos.size) {
        const slide = seg.kind === 'slide' ? doc.slides[seg.slideIndex] : undefined;
        const active = slide?.kind === 'video' ? res.videos.get(slide.photoId) : undefined;
        if (curVidRef.current && curVidRef.current !== active) {
          curVidRef.current.pause();
          curVidRef.current = null;
        }
        if (active) {
          if (curVidRef.current !== active) {
            try {
              active.currentTime = 0;
            } catch {
              /* not seekable yet */
            }
            curVidRef.current = active;
          }
          if (playing && active.paused) void active.play().catch(() => {});
          else if (!playing && !active.paused) active.pause();
        }
      }
      drawReelFrame(ctx, doc, tRef.current, res);
      setSegIndex((prev) => (prev === index ? prev : index));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (curVidRef.current) {
        curVidRef.current.pause();
        curVidRef.current = null;
      }
    };
    // segs is derived from doc; playing/ready gate the loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing, doc]);

  // prepare the soundtrack bed (or use the user's track) when the reel changes
  useEffect(() => {
    let cancelled = false;
    bedRef.current = null;
    if (audioBuffer) {
      bedRef.current = audioBuffer;
      return;
    }
    (async () => {
      const bed = await renderVibeBed(doc.vibe, doc.durationMs).catch(() => null);
      if (!cancelled) bedRef.current = bed;
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, audioBuffer]);

  // preview audio: while playing + unmuted, loop the bed in sync with the reel
  // (same length + started at the current phase → stays aligned with the loop)
  useEffect(() => {
    if (muted || !playing || !ready) return;
    let src: AudioBufferSourceNode | null = null;
    let stopped = false;
    const AC =
      (typeof AudioContext !== 'undefined' && AudioContext) ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const start = () => {
      if (stopped) return;
      const bed = bedRef.current;
      if (!bed) {
        setTimeout(start, 120); // bed still rendering — retry shortly
        return;
      }
      const ctx = audioCtxRef.current ?? new AC();
      audioCtxRef.current = ctx;
      void ctx.resume();
      src = ctx.createBufferSource();
      src.buffer = bed;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0.9;
      src.connect(gain);
      gain.connect(ctx.destination);
      const offset = (tRef.current / 1000) % bed.duration;
      src.start(0, offset);
    };
    start();
    return () => {
      stopped = true;
      if (src) {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      }
    };
  }, [muted, playing, ready, doc]);

  useEffect(
    () => () => {
      if (audioCtxRef.current) void audioCtxRef.current.close();
    },
    [],
  );

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
