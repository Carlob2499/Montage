import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Stage, Layer as KonvaLayer, Rect, Line, Text as KonvaText, Group, Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useProjectStore } from '../../state/projectStore';
import { canvasSize, seamPositions, seamsCrossed } from '../../lib/slicer';
import { collectSnapTargets, snapBox } from '../../lib/snapping';
import { layerBBox } from '../../lib/renderer';
import { PANEL_WIDTH } from '../../types';
import type { Layer, PhotoLayer, StickerLayer, TextLayer } from '../../types';
import PhotoNode from './nodes/PhotoNode';
import TextNode from './nodes/TextNode';
import StickerNode from './nodes/StickerNode';
import { gridUploadOrder } from '../../lib/slicer';
import { useBlobImage } from '../../hooks/useBlobUrl';

export interface GuideLines {
  vertical: number[];
  horizontal: number[];
}

export default function CanvasStage({
  viewport,
}: {
  viewport: { width: number; height: number };
}) {
  const doc = useProjectStore((s) => s.doc);
  const selectedIds = useProjectStore((s) => s.selectedIds);
  const select = useProjectStore((s) => s.select);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [guides, setGuides] = useState<GuideLines>({ vertical: [], horizontal: [] });
  const [view, setView] = useState({ scale: 0.2, x: 0, y: 0 });
  const pinch = useRef<{ dist: number; center: { x: number; y: number } } | null>(null);

  const dims = useMemo(() => (doc ? canvasSize(doc) : { width: 1080, height: 1350 }), [doc]);

  // fit view on project / panel-count change
  const fitKey = doc ? `${doc.id}:${doc.panelCount}:${doc.aspect}:${doc.mode}` : '';
  useEffect(() => {
    if (!doc) return;
    const pad = 24;
    const fitAll = Math.min(
      (viewport.width - pad * 2) / dims.width,
      (viewport.height - pad * 2) / dims.height,
    );
    const fitPanel = Math.min(
      (viewport.height - pad * 2) / dims.height,
      (viewport.width - pad * 2) / (PANEL_WIDTH * 1.15),
    );
    const scale = Math.max(fitAll, Math.min(fitPanel, 1));
    setView({
      scale,
      x: (viewport.width - Math.min(dims.width, PANEL_WIDTH / 0.92) * scale) / 2,
      y: (viewport.height - dims.height * scale) / 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, viewport.width, viewport.height]);

  // attach transformer to selected nodes
  useEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    const nodes = selectedIds
      .map((id) => stage.findOne(`#node-${id}`))
      .filter(Boolean) as Konva.Node[];
    tr.nodes(nodes);
  }, [selectedIds, doc?.layers]);

  const snapTargets = useMemo(() => {
    if (!doc) return { vertical: [], horizontal: [] };
    const others = doc.layers
      .filter((l) => !selectedIds.includes(l.id))
      .map((l) => layerBBox(l));
    return collectSnapTargets(
      doc.aspect,
      doc.panelCount,
      doc.margin,
      others,
      doc.mode === 'grid',
      dims.width,
      dims.height,
    );
  }, [doc, selectedIds, dims]);

  const handleDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>, layer: Layer) => {
      const node = e.target;
      const bbox = layerBBox({ ...layer, x: node.x(), y: node.y() });
      const dx = node.x() - bbox.x;
      const dy = node.y() - bbox.y;
      const snapped = snapBox(bbox, snapTargets, 8 / view.scale);
      node.position({ x: snapped.x + dx, y: snapped.y + dy });
      setGuides(snapped.guides);
    },
    [snapTargets, view.scale],
  );

  const handleDragEnd = useCallback((e: KonvaEventObject<DragEvent>, layer: Layer) => {
    setGuides({ vertical: [], horizontal: [] });
    const { x, y } = e.target.position();
    useProjectStore.getState().updateLayers([layer.id], (l) => ({ ...l, x, y }));
  }, []);

  const onStagePointerDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage()) select([]);
  };

  // pinch zoom
  const onTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    const stage = stageRef.current!;
    stage.draggable(false);
    const p1 = { x: touches[0].clientX, y: touches[0].clientY };
    const p2 = { x: touches[1].clientX, y: touches[1].clientY };
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    if (!pinch.current) {
      pinch.current = { dist, center };
      return;
    }
    const scaleBy = dist / pinch.current.dist;
    const newScale = Math.min(3, Math.max(0.02, view.scale * scaleBy));
    const mousePointTo = {
      x: (center.x - view.x) / view.scale,
      y: (center.y - view.y) / view.scale,
    };
    setView({
      scale: newScale,
      x: center.x - mousePointTo.x * newScale,
      y: center.y - mousePointTo.y * newScale,
    });
    pinch.current = { dist, center };
  };

  const onTouchEnd = () => {
    pinch.current = null;
    stageRef.current?.draggable(true);
  };

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const scaleBy = Math.exp(-e.evt.deltaY * 0.0015);
      const newScale = Math.min(3, Math.max(0.02, view.scale * scaleBy));
      const ptr = stageRef.current!.getPointerPosition()!;
      const mousePointTo = { x: (ptr.x - view.x) / view.scale, y: (ptr.y - view.y) / view.scale };
      setView({ scale: newScale, x: ptr.x - mousePointTo.x * newScale, y: ptr.y - mousePointTo.y * newScale });
    } else {
      setView((v) => ({ ...v, x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY }));
    }
  };

  if (!doc) return null;

  const seams = doc.mode === 'carousel' ? seamPositions(doc.panelCount) : [];
  const warnSeams = new Set<number>();
  for (const layer of doc.layers) {
    if (layer.type === 'text' || (layer.type === 'photo' && layer.isSubject)) {
      for (const s of seamsCrossed(layerBBox(layer), doc.panelCount, 40)) warnSeams.add(s);
    }
  }

  return (
    <Stage
      ref={stageRef}
      width={viewport.width}
      height={viewport.height}
      scaleX={view.scale}
      scaleY={view.scale}
      x={view.x}
      y={view.y}
      draggable
      onDragEnd={(e) => {
        if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
      }}
      onMouseDown={onStagePointerDown}
      onTouchStart={onStagePointerDown}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      className="touch-none"
    >
      {/* background + canvas bounds */}
      <KonvaLayer listening={false}>
        <BackgroundRect dims={dims} />
      </KonvaLayer>

      {/* content */}
      <KonvaLayer>
        {/* clip content to canvas bounds so overflow doesn't confuse */}
        <Group clipX={0} clipY={0} clipWidth={dims.width} clipHeight={dims.height}>
          {doc.layers.map((layer) =>
            layer.type === 'photo' ? (
              <PhotoNode
                key={layer.id}
                layer={layer as PhotoLayer}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            ) : layer.type === 'text' ? (
              <TextNode
                key={layer.id}
                layer={layer as TextLayer}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            ) : (
              <StickerNode
                key={layer.id}
                layer={layer as StickerLayer}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            ),
          )}
        </Group>
        <Transformer
          ref={trRef}
          rotationSnaps={[0, 90, 180, 270]}
          rotationSnapTolerance={6}
          anchorSize={14}
          anchorCornerRadius={7}
          borderStroke="#3b82f6"
          anchorStroke="#3b82f6"
          anchorFill="#ffffff"
          keepRatio={false}
          flipEnabled={false}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 12 || newBox.height < 12 ? oldBox : newBox
          }
        />
      </KonvaLayer>

      {/* overlay: seams, guides, labels */}
      <KonvaLayer listening={false}>
        {seams.map((sx, i) => (
          <Line
            key={sx}
            points={[sx, 0, sx, dims.height]}
            stroke={warnSeams.has(i) ? '#ef4444' : '#3b82f6'}
            strokeWidth={warnSeams.has(i) ? 3 / view.scale : 1.5 / view.scale}
            dash={[10 / view.scale, 8 / view.scale]}
            opacity={0.8}
          />
        ))}
        {doc.mode === 'carousel' &&
          Array.from({ length: doc.panelCount }, (_, i) => (
            <KonvaText
              key={i}
              x={i * PANEL_WIDTH + 16}
              y={16}
              text={`${i + 1}`}
              fontSize={28 / view.scale}
              fontStyle="bold"
              fill="#3b82f6"
              opacity={0.6}
            />
          ))}
        {doc.mode === 'grid' && <GridOverlay dims={dims} rows={doc.panelCount} scale={view.scale} />}
        {guides.vertical.map((x) => (
          <Line key={`v${x}`} points={[x, 0, x, dims.height]} stroke="#f472b6" strokeWidth={1 / view.scale} />
        ))}
        {guides.horizontal.map((y) => (
          <Line key={`h${y}`} points={[0, y, dims.width, y]} stroke="#f472b6" strokeWidth={1 / view.scale} />
        ))}
        {doc.margin > 0 && (
          <Rect
            x={doc.margin}
            y={doc.margin}
            width={dims.width - doc.margin * 2}
            height={dims.height - doc.margin * 2}
            stroke="#a1a1aa"
            strokeWidth={0.75 / view.scale}
            dash={[6 / view.scale, 6 / view.scale]}
            opacity={0.35}
          />
        )}
      </KonvaLayer>
    </Stage>
  );
}

function BackgroundRect({ dims }: { dims: { width: number; height: number } }) {
  const bg = useProjectStore((s) => s.doc?.background);
  const bgPhotoId = bg?.kind === 'blurPhoto' ? bg.photoId : null;
  const img = useBlobImage('proxies', bgPhotoId);
  if (!bg) return null;

  const common = { x: 0, y: 0, width: dims.width, height: dims.height };
  const shadow = {
    shadowColor: 'black',
    shadowBlur: 30,
    shadowOpacity: 0.25,
  };
  if (bg.kind === 'solid') return <Rect {...common} fill={bg.color} {...shadow} />;
  if (bg.kind === 'linear') {
    const rad = ((bg.angle - 90) * Math.PI) / 180;
    const r = Math.sqrt(dims.width ** 2 + dims.height ** 2) / 2;
    const cx = dims.width / 2;
    const cy = dims.height / 2;
    return (
      <Rect
        {...common}
        {...shadow}
        fillLinearGradientStartPoint={{ x: cx - Math.cos(rad) * r, y: cy - Math.sin(rad) * r }}
        fillLinearGradientEndPoint={{ x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r }}
        fillLinearGradientColorStops={[0, bg.from, 1, bg.to]}
      />
    );
  }
  if (bg.kind === 'radial') {
    return (
      <Rect
        {...common}
        {...shadow}
        fillRadialGradientStartPoint={{ x: dims.width / 2, y: dims.height / 2 }}
        fillRadialGradientEndPoint={{ x: dims.width / 2, y: dims.height / 2 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndRadius={Math.max(dims.width, dims.height) / 1.5}
        fillRadialGradientColorStops={[0, bg.from, 1, bg.to]}
      />
    );
  }
  // blurPhoto — draw dimmed cover image (blur approximated at export quality)
  if (!img) return <Rect {...common} fill="#222" {...shadow} />;
  const scale = Math.max(dims.width / img.width, dims.height / img.height);
  return (
    <>
      <Rect {...common} fill="#222" {...shadow} />
      <KonvaImage
        image={img}
        x={(dims.width - img.width * scale) / 2}
        y={(dims.height - img.height * scale) / 2}
        width={img.width * scale}
        height={img.height * scale}
        opacity={1 - bg.dim}
        blurRadius={bg.blur}
        filters={[]}
      />
    </>
  );
}

function GridOverlay({
  dims,
  rows,
  scale,
}: {
  dims: { width: number; height: number };
  rows: number;
  scale: number;
}) {
  const order = gridUploadOrder(rows);
  const uploadIndex = new Map(order.map((t, i) => [`${t.row},${t.col}`, i + 1]));
  const lines: React.ReactNode[] = [];
  for (let x = PANEL_WIDTH; x < dims.width; x += PANEL_WIDTH) {
    lines.push(
      <Line
        key={`gx${x}`}
        points={[x, 0, x, dims.height]}
        stroke="#3b82f6"
        strokeWidth={1.5 / scale}
        dash={[10 / scale, 8 / scale]}
        opacity={0.8}
      />,
    );
  }
  for (let y = PANEL_WIDTH; y < dims.height; y += PANEL_WIDTH) {
    lines.push(
      <Line
        key={`gy${y}`}
        points={[0, y, dims.width, y]}
        stroke="#3b82f6"
        strokeWidth={1.5 / scale}
        dash={[10 / scale, 8 / scale]}
        opacity={0.8}
      />,
    );
  }
  return (
    <>
      {lines}
      {Array.from({ length: rows }, (_, r) =>
        [0, 1, 2].map((c) => (
          <KonvaText
            key={`${r}-${c}`}
            x={c * PANEL_WIDTH + 16}
            y={r * PANEL_WIDTH + 16}
            text={`upload #${uploadIndex.get(`${r},${c}`)}`}
            fontSize={24 / scale}
            fill="#3b82f6"
            opacity={0.55}
          />
        )),
      )}
    </>
  );
}
