import { memo, useRef } from 'react';
import { Group, Rect } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useProjectStore } from '../../../state/projectStore';
import type { CardLayer, Layer } from '../../../types';

export default memo(CardNode);

function CardNode({
  layer,
  onDragMove,
  onDragEnd,
}: {
  layer: CardLayer;
  onDragMove: (e: KonvaEventObject<DragEvent>, layer: Layer) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>, layer: Layer) => void;
}) {
  const ref = useRef<Konva.Group>(null);

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
      ...(l.type === 'card'
        ? { width: Math.max(12, layer.width * scaleX), height: Math.max(12, layer.height * scaleY) }
        : {}),
    }));
  };

  const r = Math.min(layer.cornerRadius, layer.width / 2, layer.height / 2);

  return (
    <Group
      ref={ref}
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
      onTransformEnd={onTransformEnd}
    >
      <Rect
        width={layer.width}
        height={layer.height}
        cornerRadius={r}
        fill={layer.fill}
        perfectDrawEnabled={false}
      />
      {layer.glass && (
        <>
          <Rect
            width={layer.width}
            height={layer.height}
            cornerRadius={r}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: layer.height }}
            fillLinearGradientColorStops={[
              0,
              'rgba(255,255,255,0.32)',
              0.45,
              'rgba(255,255,255,0.04)',
              1,
              'rgba(255,255,255,0)',
            ]}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Rect
            width={layer.width}
            height={layer.height}
            cornerRadius={r}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={2}
            listening={false}
            perfectDrawEnabled={false}
          />
        </>
      )}
    </Group>
  );
}
