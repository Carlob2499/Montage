import { memo, useEffect, useMemo, useRef } from 'react';
import { Group, Image as KonvaImage, Line, Rect, Text as KonvaText } from 'react-konva';
import Konva from 'konva';
import { frameContentRect, tapeStrips, tornEdgePath, tracePath } from '../../../lib/frameStyles';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/db';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { useBlobImage, useBlobVideo } from '../../../hooks/useBlobUrl';
import { coverCrop } from '../../../lib/imageUtils';
import { applyAdjustments, isNeutral, normalizeAdjustments } from '../../../lib/editStack';
import type { Layer, PhotoLayer } from '../../../types';

// memoized: during a drag only the dragged layer's object identity changes,
// so the other 20+ nodes skip reconciliation entirely
export default memo(PhotoNode);

function PhotoNode({
  layer,
  onDragMove,
  onDragEnd,
  canPlay = true,
}: {
  layer: PhotoLayer;
  onDragMove: (e: KonvaEventObject<DragEvent>, layer: Layer) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>, layer: Layer) => void;
  /** within the concurrent-video cap → allowed to autoplay (else holds poster) */
  canPlay?: boolean;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const imageRef = useRef<Konva.Image>(null);
  const record = useLiveQuery(
    () => (layer.photoId ? db.photos.get(layer.photoId) : undefined),
    [layer.photoId],
  );
  const edit = useLiveQuery(
    () => (layer.photoId ? db.edits.get(layer.photoId) : undefined),
    [layer.photoId],
  );
  const isVideo = record?.kind === 'video';
  const motion = useUIStore((s) => s.motion);
  // videos store their full-size poster frame as the proxy
  const img = useBlobImage('proxies', layer.photoId || null);
  // live clip: only load/play when it's a video, motion is on, and it's within
  // the concurrent-play cap. Otherwise the poster still is used.
  const wantVideo = !!isVideo && motion && canPlay;
  const video = useBlobVideo('originals', layer.photoId || null, wantVideo);

  // pre-apply the stack crop (crop rect + rotate/flip) to an offscreen canvas
  const source = useMemo(() => {
    if (!img) return null;
    const crop = edit?.stack.crop;
    if (!crop) return img;
    const iw = img.width;
    const ih = img.height;
    const cw = Math.max(1, Math.round(crop.width * iw));
    const ch = Math.max(1, Math.round(crop.height * ih));
    const rotated = crop.rotate === 90 || crop.rotate === 270;
    const canvas = document.createElement('canvas');
    canvas.width = rotated ? ch : cw;
    canvas.height = rotated ? cw : ch;
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((crop.rotate * Math.PI) / 180);
    ctx.scale(crop.flipH ? -1 : 1, crop.flipV ? -1 : 1);
    ctx.drawImage(img, crop.x * iw, crop.y * ih, cw, ch, -cw / 2, -ch / 2, cw, ch);
    ctx.restore();
    return canvas;
  }, [img, edit?.stack.crop]);

  const adjustments = edit ? normalizeAdjustments(edit.stack.adjustments) : undefined;
  // per-frame color adjustments/crop are intentionally NOT applied to a live
  // clip (the poster still carries them) — keeps playback + motion export cheap
  const hasFilter = !!adjustments && !isNeutral(adjustments) && !video;

  const filterFn = useMemo(() => {
    if (!hasFilter || !adjustments) return undefined;
    const adj = { ...adjustments };
    return (imageData: ImageData) => {
      applyAdjustments(imageData.data, imageData.width, imageData.height, adj);
    };
  }, [hasFilter, adjustments]);

  // (re)cache the image node when filters are active — required by Konva.
  // A playing video never caches (it must redraw its live frame each tick).
  useEffect(() => {
    const node = imageRef.current;
    if (!node) return;
    if (hasFilter && source && !video) {
      // cap cache resolution so filtering stays fast while editing
      const pixelRatio = Math.min(1, 1200 / Math.max(layer.width, layer.height));
      node.cache({ pixelRatio });
    } else {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
  }, [hasFilter, filterFn, source, video, layer.width, layer.height, layer.imgScale, layer.imgOffsetX, layer.imgOffsetY]);

  // drive live playback: start the clip and pump frames onto the Konva layer
  // via a Konva.Animation (redraws the layer each frame while playing)
  useEffect(() => {
    const node = imageRef.current;
    if (!video || !node) return;
    video.currentTime = 0;
    const anim = new Konva.Animation(() => {}, node.getLayer());
    let cancelled = false;
    void video.play().then(
      () => {
        if (!cancelled) anim.start();
      },
      () => {
        /* autoplay blocked (should not happen for muted) — poster stays */
      },
    );
    return () => {
      cancelled = true;
      anim.stop();
      video.pause();
    };
  }, [video]);

  const content = useMemo(
    () => frameContentRect(layer.frameStyle, layer.width, layer.height),
    [layer.frameStyle, layer.width, layer.height],
  );

  const crop = useMemo(() => {
    if (!source) return undefined;
    const iw = source.width;
    const ih = source.height;
    return coverCrop(iw, ih, content.width, content.height, layer.imgScale, layer.imgOffsetX, layer.imgOffsetY);
  }, [source, content.width, content.height, layer.imgScale, layer.imgOffsetX, layer.imgOffsetY]);

  // a playing clip draws directly from the video element (same cover-fit math
  // as the poster/export → preview parity), skipping the poster crop pipeline
  const videoCrop = useMemo(() => {
    if (!video || !video.videoWidth || !video.videoHeight) return undefined;
    return coverCrop(
      video.videoWidth,
      video.videoHeight,
      content.width,
      content.height,
      layer.imgScale,
      layer.imgOffsetX,
      layer.imgOffsetY,
    );
  }, [video, content.width, content.height, layer.imgScale, layer.imgOffsetX, layer.imgOffsetY]);

  const playing = !!video && !!videoCrop;
  const displaySource = playing ? video : source;
  const displayCrop = playing ? videoCrop : crop;

  const tornPts = useMemo(
    () =>
      layer.frameStyle === 'torn'
        ? tornEdgePath(layer.width, layer.height, layer.id)
        : null,
    [layer.frameStyle, layer.width, layer.height, layer.id],
  );

  const selectMe = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    const { selectedIds, select } = useProjectStore.getState();
    const multi =
      'shiftKey' in e.evt ? e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey : false;
    if (multi) {
      select(
        selectedIds.includes(layer.id)
          ? selectedIds.filter((id) => id !== layer.id)
          : [...selectedIds, layer.id],
      );
    } else if (!selectedIds.includes(layer.id)) {
      select([layer.id]);
    }
  };

  const openContent = () => {
    useProjectStore.getState().select([layer.id]);
    if (!layer.photoId) {
      useUIStore.getState().setPickerTarget({ kind: 'fill', layerId: layer.id });
      useUIStore.getState().go('library');
    } else {
      useUIStore.getState().openSheet('photoEdit');
    }
  };

  const onTransformEnd = () => {
    const node = groupRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scale({ x: 1, y: 1 });
    useProjectStore.getState().updateLayers([layer.id], (l) => ({
      ...l,
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      ...(l.type === 'photo'
        ? {
            width: Math.max(12, layer.width * scaleX),
            height: Math.max(12, layer.height * scaleY),
          }
        : {}),
    }));
  };

  const r = Math.min(layer.cornerRadius, layer.width / 2, layer.height / 2);

  const clipFunc =
    layer.frameStyle === 'torn' && tornPts
      ? (ctx: Konva.Context) => tracePath(ctx, tornPts)
      : layer.frameStyle
        ? undefined
        : (ctx: Konva.Context) => {
            const w = layer.width;
            const h = layer.height;
            ctx.beginPath();
            if (r > 0) {
              ctx.moveTo(r, 0);
              ctx.arcTo(w, 0, w, h, r);
              ctx.arcTo(w, h, 0, h, r);
              ctx.arcTo(0, h, 0, 0, r);
              ctx.arcTo(0, 0, w, 0, r);
            } else {
              ctx.rect(0, 0, w, h);
            }
            ctx.closePath();
          };

  return (
    <Group
      ref={groupRef}
      id={`node-${layer.id}`}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      opacity={layer.opacity}
      draggable={!layer.locked}
      onDragMove={(e) => onDragMove(e, layer)}
      onDragEnd={(e) => onDragEnd(e, layer)}
      onMouseDown={selectMe}
      onTouchStart={selectMe}
      onDblClick={openContent}
      onDblTap={openContent}
      onTransformEnd={onTransformEnd}
    >
      {/* frame backing — outside the clip so shadows render */}
      {layer.frameStyle === 'polaroid' && (
        <Rect
          width={layer.width}
          height={layer.height}
          fill="#fdfdf8"
          shadowColor="rgba(0,0,0,0.28)"
          shadowBlur={14}
          shadowOffsetY={5}
          perfectDrawEnabled={false}
        />
      )}
      {layer.frameStyle === 'torn' && tornPts && (
        <Line
          points={tornPts.flatMap((p) => [p.x, p.y])}
          closed
          fill="#ffffff"
          shadowColor="rgba(0,0,0,0.25)"
          shadowBlur={10}
          shadowOffsetY={4}
          perfectDrawEnabled={false}
        />
      )}
      <Group clipFunc={clipFunc}>
        {displaySource && displayCrop ? (
          <KonvaImage
            ref={imageRef}
            image={displaySource}
            x={content.x}
            y={content.y}
            width={content.width}
            height={content.height}
            crop={{
              x: displayCrop.sx,
              y: displayCrop.sy,
              width: displayCrop.sw,
              height: displayCrop.sh,
            }}
            filters={filterFn ? [filterFn] : undefined}
            perfectDrawEnabled={false}
          />
        ) : (
          <>
            <Rect
              x={content.x}
              y={content.y}
              width={content.width}
              height={content.height}
              fill="rgba(127,127,127,0.12)"
              stroke="#9ca3af"
              strokeWidth={2}
              dash={[12, 10]}
            />
            <KonvaText
              x={content.x}
              y={content.y}
              width={content.width}
              height={content.height}
              text={layer.photoId ? '…' : '+ tap to fill'}
              align="center"
              verticalAlign="middle"
              fontSize={Math.max(20, Math.min(40, layer.width / 8))}
              fill="#9ca3af"
            />
          </>
        )}
      </Group>
      {layer.frameStyle === 'tape' &&
        tapeStrips(layer.width, layer.height, layer.id).map((s, i) => (
          <Rect
            key={i}
            x={s.cx}
            y={s.cy}
            offsetX={s.width / 2}
            offsetY={s.height / 2}
            width={s.width}
            height={s.height}
            rotation={s.rotation}
            fill="rgba(255,255,255,0.45)"
            listening={false}
            perfectDrawEnabled={false}
          />
        ))}
      {isVideo && (
        <KonvaText
          x={12}
          y={12}
          text={playing ? '▶ live' : '❚❚ video'}
          fontSize={22}
          fill="#ffffff"
          shadowColor="black"
          shadowBlur={6}
          listening={false}
        />
      )}
    </Group>
  );
}
