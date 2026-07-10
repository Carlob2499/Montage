import { memo, useEffect, useMemo, useRef } from 'react';
import { Group, Image as KonvaImage, Rect, Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/db';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import { useBlobImage } from '../../../hooks/useBlobUrl';
import { coverCrop } from '../../../lib/imageUtils';
import { applyAdjustments, isNeutral } from '../../../lib/editStack';
import type { Layer, PhotoLayer } from '../../../types';

// memoized: during a drag only the dragged layer's object identity changes,
// so the other 20+ nodes skip reconciliation entirely
export default memo(PhotoNode);

function PhotoNode({
  layer,
  onDragMove,
  onDragEnd,
}: {
  layer: PhotoLayer;
  onDragMove: (e: KonvaEventObject<DragEvent>, layer: Layer) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>, layer: Layer) => void;
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
  // videos store their full-size poster frame as the proxy
  const img = useBlobImage('proxies', layer.photoId || null);

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

  const adjustments = edit?.stack.adjustments;
  const hasFilter = !!adjustments && !isNeutral(adjustments);

  const filterFn = useMemo(() => {
    if (!hasFilter || !adjustments) return undefined;
    const adj = { ...adjustments };
    return (imageData: ImageData) => {
      applyAdjustments(imageData.data, imageData.width, imageData.height, adj);
    };
  }, [hasFilter, adjustments]);

  // (re)cache the image node when filters are active — required by Konva
  useEffect(() => {
    const node = imageRef.current;
    if (!node) return;
    if (hasFilter && source) {
      // cap cache resolution so filtering stays fast while editing
      const pixelRatio = Math.min(1, 1200 / Math.max(layer.width, layer.height));
      node.cache({ pixelRatio });
    } else {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
  }, [hasFilter, filterFn, source, layer.width, layer.height, layer.imgScale, layer.imgOffsetX, layer.imgOffsetY]);

  const crop = useMemo(() => {
    if (!source) return undefined;
    const iw = source.width;
    const ih = source.height;
    return coverCrop(iw, ih, layer.width, layer.height, layer.imgScale, layer.imgOffsetX, layer.imgOffsetY);
  }, [source, layer.width, layer.height, layer.imgScale, layer.imgOffsetX, layer.imgOffsetY]);

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
      clipFunc={(ctx) => {
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
      }}
    >
      {source && crop ? (
        <KonvaImage
          ref={imageRef}
          image={source}
          x={0}
          y={0}
          width={layer.width}
          height={layer.height}
          crop={{ x: crop.sx, y: crop.sy, width: crop.sw, height: crop.sh }}
          filters={filterFn ? [filterFn] : undefined}
          perfectDrawEnabled={false}
        />
      ) : (
        <>
          <Rect
            width={layer.width}
            height={layer.height}
            fill="rgba(127,127,127,0.12)"
            stroke="#9ca3af"
            strokeWidth={2}
            dash={[12, 10]}
          />
          <KonvaText
            width={layer.width}
            height={layer.height}
            text={layer.photoId ? '…' : '+ tap to fill'}
            align="center"
            verticalAlign="middle"
            fontSize={Math.max(20, Math.min(40, layer.width / 8))}
            fill="#9ca3af"
          />
        </>
      )}
      {isVideo && (
        <KonvaText
          x={12}
          y={12}
          text="▶ video (exports as still)"
          fontSize={22}
          fill="#ffffff"
          shadowColor="black"
          shadowBlur={6}
        />
      )}
    </Group>
  );
}
