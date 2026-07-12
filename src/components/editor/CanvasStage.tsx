import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Stage, Layer as KonvaLayer, Rect, Line, Text as KonvaText, Group, Image as KonvaImage, Transformer } from 'react-konva';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useProjectStore } from '../../state/projectStore';
import { canvasSize, seamPositions, seamsCrossed } from '../../lib/slicer';
import { collectSnapTargets, snapBox } from '../../lib/snapping';
import { layerBBox } from '../../lib/renderer';
import type { CardLayer, Layer, PhotoLayer, StickerLayer, TextLayer } from '../../types';
import PhotoNode from './nodes/PhotoNode';
import TextNode from './nodes/TextNode';
import StickerNode from './nodes/StickerNode';
import CardNode from './nodes/CardNode';
import { gridUploadOrder } from '../../lib/slicer';
import { useBlobImage } from '../../hooks/useBlobUrl';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';

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
  const panelW = doc?.panelWidth ?? 1080;

  // which of the doc's photo layers are actually videos (drives the autoplay cap)
  const photoIdsKey = doc
    ? doc.layers
        .filter((l): l is PhotoLayer => l.type === 'photo' && !!l.photoId)
        .map((l) => l.photoId)
        .join(',')
    : '';
  const videoPhotoIds = useLiveQuery(async () => {
    const ids = photoIdsKey ? photoIdsKey.split(',') : [];
    if (!ids.length) return new Set<string>();
    const rows = await db.photos.bulkGet(ids);
    return new Set(rows.filter((r) => r?.kind === 'video').map((r) => r!.id));
  }, [photoIdsKey]) ?? new Set<string>();

  // fit view on project / panel-count / geometry change
  const fitKey = doc
    ? `${doc.id}:${doc.panelCount}:${doc.aspect}:${doc.mode}:${doc.panelWidth}:${doc.panelHeight}`
    : '';
  useEffect(() => {
    if (!doc) return;
    const pad = 24;
    const fitAll = Math.min(
      (viewport.width - pad * 2) / dims.width,
      (viewport.height - pad * 2) / dims.height,
    );
    const fitPanel = Math.min(
      (viewport.height - pad * 2) / dims.height,
      (viewport.width - pad * 2) / (panelW * 1.15),
    );
    const scale = Math.max(fitAll, Math.min(fitPanel, 1));
    setView({
      scale,
      x: (viewport.width - Math.min(dims.width, panelW / 0.92) * scale) / 2,
      y: (viewport.height - dims.height * scale) / 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, viewport.width, viewport.height]);

  // Attach transformer to selected nodes. No dep array on purpose: selected
  // nodes can mount AFTER selection (blob images load async) or be replaced
  // by a remount — re-resolve each render and only touch the transformer
  // when the actual node set changed.
  useEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    const nodes = selectedIds
      .map((id) => stage.findOne(`#node-${id}`))
      .filter(Boolean) as Konva.Node[];
    const current = tr.nodes();
    const same =
      current.length === nodes.length && current.every((n, i) => n === nodes[i]);
    if (!same) tr.nodes(nodes);
  });

  const snapTargets = useMemo(() => {
    if (!doc) return { vertical: [], horizontal: [] };
    const others = doc.layers
      .filter((l) => !selectedIds.includes(l.id))
      .map((l) => layerBBox(l));
    return collectSnapTargets(
      doc.panelWidth,
      doc.panelHeight,
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

  // pinch zoom — all view math uses functional updates: two touch events can
  // land between renders, and a stale `view` closure would drop the first
  // event's zoom factor and make the anchor point drift
  const onTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    stageRef.current?.draggable(false);
    const p1 = { x: touches[0].clientX, y: touches[0].clientY };
    const p2 = { x: touches[1].clientX, y: touches[1].clientY };
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const prev = pinch.current;
    pinch.current = { dist, center };
    if (!prev) return;
    setView((v) => {
      const newScale = Math.min(3, Math.max(0.02, v.scale * (dist / prev.dist)));
      const pointTo = { x: (center.x - v.x) / v.scale, y: (center.y - v.y) / v.scale };
      return {
        scale: newScale,
        x: center.x - pointTo.x * newScale,
        y: center.y - pointTo.y * newScale,
      };
    });
  };

  const onTouchEnd = () => {
    pinch.current = null;
    stageRef.current?.draggable(true);
  };

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const scaleBy = Math.exp(-e.evt.deltaY * 0.0015);
      const ptr = stageRef.current!.getPointerPosition()!;
      setView((v) => {
        const newScale = Math.min(3, Math.max(0.02, v.scale * scaleBy));
        const pointTo = { x: (ptr.x - v.x) / v.scale, y: (ptr.y - v.y) / v.scale };
        return { scale: newScale, x: ptr.x - pointTo.x * newScale, y: ptr.y - pointTo.y * newScale };
      });
    } else {
      setView((v) => ({ ...v, x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY }));
    }
  };

  if (!doc) return null;

  // iOS Safari drops video elements past a low simultaneous-play ceiling, so
  // only the first few VIDEO layers autoplay; the rest hold their poster.
  const MAX_CONCURRENT_VIDEOS = 8;
  const playableVideoIds = new Set(
    doc.layers
      .filter((l) => l.type === 'photo' && l.photoId && videoPhotoIds.has(l.photoId))
      .slice(0, MAX_CONCURRENT_VIDEOS)
      .map((l) => l.id),
  );

  const seams = doc.mode === 'carousel' ? seamPositions(doc.panelCount, doc.panelWidth) : [];
  const warnSeams = new Set<number>();
  for (const layer of doc.layers) {
    if (layer.type === 'text' || (layer.type === 'photo' && layer.isSubject)) {
      for (const s of seamsCrossed(layerBBox(layer), doc.panelCount, doc.panelWidth, 40))
        warnSeams.add(s);
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
                canPlay={playableVideoIds.has(layer.id)}
              />
            ) : layer.type === 'text' ? (
              <TextNode
                key={layer.id}
                layer={layer as TextLayer}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            ) : layer.type === 'card' ? (
              <CardNode
                key={layer.id}
                layer={layer as CardLayer}
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
              x={i * doc.panelWidth + 16}
              y={16}
              text={`${i + 1}`}
              fontSize={28 / view.scale}
              fontStyle="bold"
              fill="#3b82f6"
              opacity={0.6}
            />
          ))}
        {doc.mode === 'grid' && (
          <GridOverlay dims={dims} rows={doc.panelCount} tile={doc.panelWidth} scale={view.scale} />
        )}
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
    const stops =
      bg.stops && bg.stops.length >= 2
        ? bg.stops.flatMap((s) => [s.at, s.color])
        : [0, bg.from, 1, bg.to];
    return (
      <Rect
        {...common}
        {...shadow}
        fillLinearGradientStartPoint={{ x: cx - Math.cos(rad) * r, y: cy - Math.sin(rad) * r }}
        fillLinearGradientEndPoint={{ x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r }}
        fillLinearGradientColorStops={stops}
      />
    );
  }
  if (bg.kind === 'radial') {
    const stops =
      bg.stops && bg.stops.length >= 2
        ? bg.stops.flatMap((s) => [s.at, s.color])
        : [0, bg.from, 1, bg.to];
    return (
      <Rect
        {...common}
        {...shadow}
        fillRadialGradientStartPoint={{ x: dims.width / 2, y: dims.height / 2 }}
        fillRadialGradientEndPoint={{ x: dims.width / 2, y: dims.height / 2 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndRadius={Math.max(dims.width, dims.height) / 1.5}
        fillRadialGradientColorStops={stops}
      />
    );
  }
  // blurPhoto — real blur preview via Konva's Blur filter on a cached node
  if (!img) return <Rect {...common} fill="#222" {...shadow} />;
  return (
    <>
      <Rect {...common} fill="#222" {...shadow} />
      <BlurredBgImage img={img} dims={dims} blur={bg.blur} />
      <Rect {...common} fill="black" opacity={bg.dim} />
    </>
  );
}

function BlurredBgImage({
  img,
  dims,
  blur,
}: {
  img: HTMLImageElement;
  dims: { width: number; height: number };
  blur: number;
}) {
  const ref = useRef<Konva.Image>(null);
  // Konva filters need a cached node; cache at a low pixel ratio — it's a
  // blur, so resolution loss is invisible and the filter pass stays cheap
  const pixelRatio = Math.min(0.25, 900 / Math.max(dims.width, dims.height));
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.cache({ pixelRatio });
    node.getLayer()?.batchDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, dims.width, dims.height, blur, pixelRatio]);
  const scale = Math.max(dims.width / img.width, dims.height / img.height);
  return (
    <KonvaImage
      ref={ref}
      image={img}
      x={(dims.width - img.width * scale) / 2}
      y={(dims.height - img.height * scale) / 2}
      width={img.width * scale}
      height={img.height * scale}
      filters={[Konva.Filters.Blur]}
      // blur radius operates on cached pixels: canvas px → cached px is pixelRatio
      blurRadius={Math.max(0, blur * pixelRatio)}
      listening={false}
    />
  );
}

function GridOverlay({
  dims,
  rows,
  tile,
  scale,
}: {
  dims: { width: number; height: number };
  rows: number;
  tile: number;
  scale: number;
}) {
  const order = gridUploadOrder(rows);
  const uploadIndex = new Map(order.map((t, i) => [`${t.row},${t.col}`, i + 1]));
  const lines: React.ReactNode[] = [];
  for (let x = tile; x < dims.width; x += tile) {
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
  for (let y = tile; y < dims.height; y += tile) {
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
            x={c * tile + 16}
            y={r * tile + 16}
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
