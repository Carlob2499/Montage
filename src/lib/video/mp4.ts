// ---------------------------------------------------------------------------
// Frame-exact MP4 (H.264/AAC) encoding via WebCodecs + mp4-muxer.
//
// Why this exists: MediaRecorder is real-time (captures the canvas at wall-clock
// cadence, so a hitch drops frames → judder) and its container is codec-roulette
// (WebM on some browsers, which Instagram/iOS Photos reject). WebCodecs lets us
// drive the encoder frame-by-frame with exact timestamps → smooth, deterministic,
// faster-than-real-time, and ALWAYS an H.264 MP4 with proper duration metadata,
// which is the one format every social app + the iOS camera roll accepts.
//
// Everything here is a graceful enhancement: `encodeCanvasToMp4` returns null
// when WebCodecs (or the required codec) isn't available, and the caller falls
// back to MediaRecorder. No network, no wasm — mp4-muxer is pure JS.
// ---------------------------------------------------------------------------

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Mp4EncodeOptions {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  /** draw one frame at absolute time tMs; may be async (e.g. seeking a clip). */
  draw: (ctx: AnyCtx2D, tMs: number) => void | Promise<void>;
  /** optional soundtrack, muxed as AAC. Omitted/null → a silent (video-only) MP4. */
  audioBuffer?: AudioBuffer | null;
  /** target video bitrate (bits/sec). Default 12 Mbps — generous so Instagram's
   *  re-compression still has clean pixels to work from. */
  videoBitrate?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Fast sync check that WebCodecs video encoding even exists in this engine. */
export function webcodecsAvailable(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined'
  );
}

/** H.264 profile/level candidates that cover 1080p portrait/landscape. */
const AVC_CODECS = [
  'avc1.640028', // High 4.0
  'avc1.4d0028', // Main 4.0
  'avc1.640033', // High 5.1 (headroom for big canvases)
  'avc1.42e028', // Baseline 4.0 (widest support)
];

/** First AVC codec string the encoder accepts for (w,h), or null if none. */
async function pickAvcCodec(width: number, height: number, bitrate: number): Promise<string | null> {
  for (const codec of AVC_CODECS) {
    try {
      const res = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate });
      if (res.supported) return codec;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/** Can we encode AAC at this rate/channel count? (null audio needs no check.) */
async function aacSupported(sampleRate: number, channels: number): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined') return false;
  try {
    const res = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate,
      numberOfChannels: channels,
      bitrate: 128_000,
    });
    return !!res.supported;
  } catch {
    return false;
  }
}

/**
 * Interleave an AudioBuffer's channels into planar f32 chunks of `frames`
 * samples each, tagged with a microsecond timestamp. Pure — unit tested.
 * Planar layout = [all ch0 samples][all ch1 samples]… per chunk (what
 * AudioData 'f32-planar' expects).
 */
export function planarAudioChunks(
  channelData: Float32Array[],
  sampleRate: number,
  framesPerChunk = 1024,
): { data: Float32Array; timestampUs: number; frames: number }[] {
  const channels = channelData.length;
  const total = channelData[0]?.length ?? 0;
  const chunks: { data: Float32Array; timestampUs: number; frames: number }[] = [];
  for (let start = 0; start < total; start += framesPerChunk) {
    const frames = Math.min(framesPerChunk, total - start);
    const data = new Float32Array(frames * channels);
    for (let ch = 0; ch < channels; ch++) {
      data.set(channelData[ch].subarray(start, start + frames), ch * frames);
    }
    chunks.push({ data, timestampUs: Math.round((start / sampleRate) * 1e6), frames });
  }
  return chunks;
}

/**
 * Encode a canvas animation to an H.264/AAC MP4 by drawing every frame and
 * feeding it to a WebCodecs VideoEncoder. Returns null (no throw) when the
 * platform can't do it, so callers can fall back to MediaRecorder.
 */
export async function encodeCanvasToMp4(opts: Mp4EncodeOptions): Promise<Blob | null> {
  if (!webcodecsAvailable()) return null;
  const { width, height, fps, durationMs } = opts;
  const bitrate = opts.videoBitrate ?? 12_000_000;

  const codec = await pickAvcCodec(width, height, bitrate);
  if (!codec) return null;

  // If a soundtrack is requested but we can't AAC-encode it, bail to the
  // fallback path (MediaRecorder muxes audio itself) rather than drop the music.
  const buf = opts.audioBuffer ?? null;
  const wantAudio = !!buf && buf.length > 0;
  if (wantAudio && !(await aacSupported(buf!.sampleRate, buf!.numberOfChannels))) {
    return null;
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    ...(wantAudio
      ? { audio: { codec: 'aac', numberOfChannels: buf!.numberOfChannels, sampleRate: buf!.sampleRate } }
      : {}),
    fastStart: 'in-memory', // moov atom up front → streams/plays immediately
    firstTimestampBehavior: 'offset',
  });

  let encoderError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
    },
  });
  videoEncoder.configure({ codec, width, height, bitrate, framerate: fps });

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';

  const frameDurUs = 1e6 / fps;
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
  const gop = Math.max(1, Math.round(fps * 2)); // keyframe every ~2s

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (opts.signal?.aborted) break;
      if (encoderError) throw encoderError;
      const tMs = (i / fps) * 1000;
      await opts.draw(ctx, tMs);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDurUs) });
      videoEncoder.encode(frame, { keyFrame: i % gop === 0 });
      frame.close();
      // don't let the encoder queue grow unbounded on slower machines
      if (videoEncoder.encodeQueueSize > 8) {
        await new Promise((r) => setTimeout(r, 0));
      }
      opts.onProgress?.((i + 1) / totalFrames);
    }
    await videoEncoder.flush();

    if (wantAudio) {
      await encodeAudio(muxer, buf!, opts.signal);
    }

    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  } catch {
    // any encode failure → let the caller fall back to MediaRecorder
    return null;
  } finally {
    try {
      if (videoEncoder.state !== 'closed') videoEncoder.close();
    } catch {
      /* already closed */
    }
  }
}

async function encodeAudio(
  muxer: Muxer<ArrayBufferTarget>,
  buffer: AudioBuffer,
  signal?: AbortSignal,
): Promise<void> {
  const channels = buffer.numberOfChannels;
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) channelData.push(buffer.getChannelData(ch));
  const chunks = planarAudioChunks(channelData, buffer.sampleRate);

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: () => {
      /* surfaced via flush rejection */
    },
  });
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: buffer.sampleRate,
    numberOfChannels: channels,
    bitrate: 128_000,
  });
  try {
    for (const c of chunks) {
      if (signal?.aborted) break;
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: buffer.sampleRate,
        numberOfFrames: c.frames,
        numberOfChannels: channels,
        timestamp: c.timestampUs,
        // a plain ArrayBuffer-backed view; cast past the ArrayBufferLike generic
        data: c.data as unknown as BufferSource,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }
    await audioEncoder.flush();
  } finally {
    try {
      if (audioEncoder.state !== 'closed') audioEncoder.close();
    } catch {
      /* already closed */
    }
  }
}
