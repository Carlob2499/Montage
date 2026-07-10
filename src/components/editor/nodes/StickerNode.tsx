import { useRef } from 'react';
import { Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useProjectStore } from '../../../state/projectStore';
import { useBlobImage } from '../../../hooks/useBlobUrl';
import type { Layer, StickerLayer } from '../../../types';

export default function StickerNode({
  layer,
  onDragMove,
  onDragEnd,
}: {
  layer: StickerLayer;
  onDragMove: (e: KonvaEventObject<DragEvent>, layer: Layer) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>, layer: Layer) => void;
}) {
  const ref = useRef<Konva.Image>(null);
  const img = useBlobImage('stickers', layer.stickerId);

  const selectMe = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    const { selectedIds, select } = useProjectStore.getState();
    if (!selectedIds.includes(layer.id)) select([layer.id]);
  };

  const onTransformEnd = () => {
    const node = ref.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scale({ x: 1, y: 1 });
    useProjectStore.getState().updateLayers([layer.id], (l) => ({
      ...l,
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      ...(l.type === 'sticker'
        ? { width: Math.max(12, layer.width * scaleX), height: Math.max(12, layer.height * scaleY) }
        : {}),
    }));
  };

  if (!img) return null;
  return (
    <KonvaImage
      ref={ref}
      id={`node-${layer.id}`}
      image={img}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation}
      opacity={layer.opacity}
      draggable={!layer.locked}
      onDragMove={(e) => onDragMove(e, layer)}
      onDragEnd={(e) => onDragEnd(e, layer)}
      onMouseDown={selectMe}
      onTouchStart={selectMe}
      onTransformEnd={onTransformEnd}
      perfectDrawEnabled={false}
    />
  );
}
