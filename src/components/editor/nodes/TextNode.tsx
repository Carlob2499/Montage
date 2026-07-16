import { memo, useRef } from 'react';
import { Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useProjectStore } from '../../../state/projectStore';
import { useUIStore } from '../../../state/uiStore';
import type { Layer, TextLayer } from '../../../types';

export default memo(TextNode);

function TextNode({
  layer,
  onDragMove,
  onDragEnd,
}: {
  layer: TextLayer;
  onDragMove: (e: KonvaEventObject<DragEvent>, layer: Layer) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>, layer: Layer) => void;
}) {
  const ref = useRef<Konva.Text>(null);

  const selectMe = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    const { selectedIds, select } = useProjectStore.getState();
    if (!selectedIds.includes(layer.id)) select([layer.id]);
  };

  const openEditor = () => {
    useProjectStore.getState().select([layer.id]);
    useUIStore.getState().openSheet('text');
  };

  const onTransformEnd = () => {
    const node = ref.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    // Konva reports the measured auto-width, so a width-less layer can bake a
    // horizontal stretch into an explicit wrap width instead of snapping back
    const measuredW = node.width();
    node.scale({ x: 1, y: 1 });
    useProjectStore.getState().updateLayers([layer.id], (l) => {
      const t = l as TextLayer;
      const horizontalResize = Math.abs(scaleX - 1) > 0.001 && Math.abs(scaleY - 1) < 0.001;
      return {
        ...t,
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        fontSize: Math.max(8, t.fontSize * scaleY),
        width: t.width
          ? Math.max(20, t.width * scaleX)
          : horizontalResize
            ? Math.max(20, measuredW * scaleX)
            : undefined,
      };
    });
  };

  return (
    <KonvaText
      ref={ref}
      id={`node-${layer.id}`}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      opacity={layer.opacity}
      text={layer.text}
      fontFamily={layer.fontFamily}
      fontSize={layer.fontSize}
      fontStyle={`${layer.fontWeight >= 600 ? 'bold' : 'normal'}`}
      letterSpacing={layer.letterSpacing}
      lineHeight={layer.lineHeight}
      fill={layer.fill}
      align={layer.align}
      width={layer.width}
      shadowEnabled={!!layer.shadow}
      shadowColor={layer.shadow?.color}
      shadowBlur={layer.shadow?.blur}
      shadowOffsetX={layer.shadow?.offsetX}
      shadowOffsetY={layer.shadow?.offsetY}
      draggable={!layer.locked}
      onDragMove={(e) => onDragMove(e, layer)}
      onDragEnd={(e) => onDragEnd(e, layer)}
      onMouseDown={selectMe}
      onTouchStart={selectMe}
      onDblClick={openEditor}
      onDblTap={openEditor}
      onTransformEnd={onTransformEnd}
      perfectDrawEnabled={false}
    />
  );
}
