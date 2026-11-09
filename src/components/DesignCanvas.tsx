import { useRef, useEffect, useState, useCallback } from 'react';
import type { Shape, Point, ToolType, Workspace, DimensionShape } from '@/types';
import { pointInShape, shapeBounds, genId, resizeShapeByDimension, findNearestShapeEndpoint, transformShape, transformDimensionAnchors, isDimensionAnchoredTo, translateShapes, findCircleNear, circleDimensionEnds, applyCircleDimension } from '@/lib/geometry';
import type { Transform } from '@/lib/geometry';
import { textToPathPoints } from '@/lib/gcode';
import { trimLineAt, extendLineAt, chamferAt } from '@/lib/trimExtend';
import { getAllFonts } from '@/lib/fontManager';

type Props = {
  shapes: Shape[];
  setShapes: (updater: (prev: Shape[]) => Shape[]) => void;
  setShapesLive: (updater: (prev: Shape[]) => Shape[]) => void;
  beginEdit: () => void;
  endEdit: () => void;
  tool: ToolType;
  workspace: Workspace;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  showGrid: boolean;
  gridSize: number;
  snapToGrid: boolean;
  showDimensions: boolean;
  polygonSides: number;
  rectFromCenter: boolean;
};

type ViewState = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

const MM_TO_PX = 4;
const HANDLE_HALF = 4;
const HANDLE_RADIUS = 5;
const HANDLE_TOLERANCE_PX = 9;
const ROTATE_HANDLE_OFFSET_PX = 28;
const ROTATE_SNAP_DEG = 15;
const CORNER_HANDLES = ['nw', 'ne', 'se', 'sw'] as const;
const HANDLE_CURSOR: Record<HandleId, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  rotate: 'grab',
};

type HandleId = 'nw' | 'ne' | 'se' | 'sw' | 'rotate';

type TransformDrag = {
  handle: HandleId;
  shapeId: string;
  original: Shape;
  dimensions: DimensionShape[];
  pivot: Point;
  startRaw: Point;
  startSnapped: Point;
  baseRotation: number;
};

export default function DesignCanvas({
  shapes,
  setShapes,
  setShapesLive,
  beginEdit,
  endEdit,
  tool,
  workspace,
  selectedIds,
  setSelectedIds,
  showGrid,
  gridSize,
  snapToGrid,
  showDimensions,
  polygonSides,
  rectFromCenter,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewState>({ scale: 1, offsetX: 40, offsetY: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [tempShape, setTempShape] = useState<Shape | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [pathPoints, setPathPoints] = useState<Point[]>([]);
  const [snapPreview, setSnapPreview] = useState<Point | null>(null);
  const [transformDrag, setTransformDrag] = useState<TransformDrag | null>(null);
  const [hoverHandle, setHoverHandle] = useState<HandleId | null>(null);

  const selectedShape = selectedIds.length === 1 ? shapes.find((s) => s.id === selectedIds[0]) || null : null;

  function snapPoint(pt: Point): Point {
    const originDist = Math.sqrt(pt.x ** 2 + pt.y ** 2);
    if (originDist < 4) return { x: 0, y: 0 };

    const shapeSnap = findNearestShapeEndpoint(shapes, pt, null, 4);
    if (shapeSnap) return shapeSnap.point;

    const edgeSnap = snapToWorkspaceEdge(pt);
    if (edgeSnap) return edgeSnap;

    if (snapToGrid) {
      const candidate = {
        x: Math.round(pt.x / gridSize) * gridSize,
        y: Math.round(pt.y / gridSize) * gridSize,
      };
      return candidate;
    }

    return pt;
  }

  function snapToWorkspaceEdge(pt: Point): Point | null {
    const threshold = 4;
    const insideX = pt.x >= -threshold && pt.x <= workspace.width + threshold;
    const insideY = pt.y >= -threshold && pt.y <= workspace.height + threshold;
    if (!insideX || !insideY) return null;

    const x = Math.abs(pt.x) <= threshold ? 0 : Math.abs(pt.x - workspace.width) <= threshold ? workspace.width : pt.x;
    const y = Math.abs(pt.y) <= threshold ? 0 : Math.abs(pt.y - workspace.height) <= threshold ? workspace.height : pt.y;
    if (x !== pt.x || y !== pt.y) return { x, y };
    return null;
  }

  const screenToWorld = useCallback((sx: number, sy: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (sx - rect.left - view.offsetX) / (MM_TO_PX * view.scale);
    const rawY = (sy - rect.top - view.offsetY) / (MM_TO_PX * view.scale);
    return { x, y: workspace.height - rawY };
  }, [view, workspace.height]);

  const worldToScreen = useCallback((wx: number, wy: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return {
      x: wx * MM_TO_PX * view.scale + view.offsetX,
      y: (workspace.height - wy) * MM_TO_PX * view.scale + view.offsetY,
    };
  }, [view, workspace.height]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = container.clientWidth + 'px';
    canvas.style.height = container.clientHeight + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }, [draw, view, shapes, tempShape, selectedIds, showGrid, gridSize, snapToGrid, showDimensions, workspace, pathPoints, snapPreview]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    if (showGrid) drawGrid(ctx, w, h);

    drawWorkspace(ctx, w, h);

    for (const shape of shapes) {
      drawShape(ctx, shape, selectedIds.includes(shape.id));
    }

    if (tempShape) drawShape(ctx, tempShape, true);

    if (tool === 'path' && pathPoints.length > 0) {
      drawPathPreview(ctx, pathPoints);
    }

    drawOrigin(ctx);

    if (showDimensions) {
      drawDimensions(ctx);
    }

    if (tool === 'select' && selectedShape && selectedShape.type !== 'dimension') {
      drawTransformHandles(ctx, selectedShape);
    }

    if (snapPreview) {
      const p = worldToScreen(snapPreview.x, snapPreview.y);
      ctx.strokeStyle = '#fbbf24';
      ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const step = gridSize * MM_TO_PX * view.scale;
    const majorStep = gridSize * 5 * MM_TO_PX * view.scale;

    if (step < 4) return;

    ctx.strokeStyle = '#1a1f2a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = view.offsetX % step; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = view.offsetY % step; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#252d3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = view.offsetX % majorStep; x < w; x += majorStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = view.offsetY % majorStep; y < h; y += majorStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }

  function drawWorkspace(ctx: CanvasRenderingContext2D, _w: number, _h: number) {
    const tl = worldToScreen(0, 0);
    const br = worldToScreen(workspace.width, workspace.height);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(59, 130, 246, 0.04)';
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    ctx.fillStyle = '#475569';
    ctx.font = '11px monospace';
    ctx.fillText(`${workspace.width}×${workspace.height} ${workspace.unit}`, tl.x + 4, tl.y - 6);
  }

  function drawOrigin(ctx: CanvasRenderingContext2D) {
    const o = worldToScreen(0, 0);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(o.x - 10, o.y);
    ctx.lineTo(o.x + 10, o.y);
    ctx.moveTo(o.x, o.y - 10);
    ctx.lineTo(o.x, o.y + 10);
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(o.x, o.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, selected: boolean) {
    ctx.strokeStyle = selected ? '#f59e0b' : '#3b82f6';
    ctx.fillStyle = selected ? 'rgba(245, 158, 11, 0.08)' : 'rgba(59, 130, 246, 0.05)';
    ctx.lineWidth = selected ? 2 : 1.5;

    switch (shape.type) {
      case 'rect': {
        const tl = worldToScreen(shape.x, shape.y);
        const br = worldToScreen(shape.x + shape.width, shape.y + shape.height);
        ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        break;
      }
      case 'circle': {
        const c = worldToScreen(shape.cx, shape.cy);
        const r = shape.radius * MM_TO_PX * view.scale;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'line': {
        const p1 = worldToScreen(shape.x1, shape.y1);
        const p2 = worldToScreen(shape.x2, shape.y2);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        break;
      }
      case 'text': {
        const paths = textToPathPoints(shape);
        ctx.strokeStyle = selected ? '#f59e0b' : '#3b82f6';
        ctx.lineWidth = selected ? 2 : 1.5;
        for (const path of paths) {
          if (path.length < 2) continue;
          ctx.beginPath();
          const first = worldToScreen(path[0].x, path[0].y);
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < path.length; i++) {
            const point = worldToScreen(path[i].x, path[i].y);
            ctx.lineTo(point.x, point.y);
          }
          ctx.stroke();
        }
        break;
      }
      case 'path': {
        if (shape.points.length < 2) break;
        ctx.beginPath();
        const first = worldToScreen(shape.points[0].x, shape.points[0].y);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < shape.points.length; i++) {
          const p = worldToScreen(shape.points[i].x, shape.points[i].y);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        break;
      }
      case 'dimension': {
        const p1 = worldToScreen(shape.x1, shape.y1);
        const p2 = worldToScreen(shape.x2, shape.y2);
        const isFromOrigin = Math.abs(shape.x1) < 0.01 && Math.abs(shape.y1) < 0.01;
        const hasTarget = !!(shape as any).targetId;
        ctx.strokeStyle = selected ? '#f59e0b' : (hasTarget ? '#22c55e' : '#a78bfa');
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = selected ? 'rgba(245,158,11,0.3)' : (hasTarget ? 'rgba(34,197,94,0.3)' : 'rgba(167,139,250,0.3)');
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y - 6); ctx.lineTo(p1.x, p1.y + 6);
        ctx.moveTo(p2.x, p2.y - 6); ctx.lineTo(p2.x, p2.y + 6);
        ctx.stroke();

        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const drawArrow = (tip: Point, direction: number) => {
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(tip.x - Math.cos(direction - 0.45) * 7, tip.y - Math.sin(direction - 0.45) * 7);
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(tip.x - Math.cos(direction + 0.45) * 7, tip.y - Math.sin(direction + 0.45) * 7);
          ctx.stroke();
        };
        ctx.strokeStyle = selected ? '#f59e0b' : (hasTarget ? '#22c55e' : '#a78bfa');
        ctx.lineWidth = 1;
        drawArrow(p1, angle);
        drawArrow(p2, angle + Math.PI);

        if (isFromOrigin) {
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        const dx = shape.x2 - shape.x1;
        const dy = shape.y2 - shape.y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        ctx.fillStyle = selected ? '#f59e0b' : (hasTarget ? '#22c55e' : '#a78bfa');
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${dist.toFixed(1)}mm`, mx, my - 6);
        ctx.textAlign = 'left';
        break;
      }
    }

    if (selected) {
      const b = shapeBounds(shape);
      const tl = worldToScreen(b.minX - 1, b.minY - 1);
      const br = worldToScreen(b.maxX + 1, b.maxY + 1);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      ctx.setLineDash([]);
    }
  }

  function drawPathPreview(ctx: CanvasRenderingContext2D, pts: Point[]) {
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = worldToScreen(pts[i].x, pts[i].y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    for (const pt of pts) {
      const p = worldToScreen(pt.x, pt.y);
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDimensions(ctx: CanvasRenderingContext2D) {
    if (shapes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of shapes) {
      if (s.type === 'dimension') continue;
      const b = shapeBounds(s);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    if (minX === Infinity) return;
    const tl = worldToScreen(minX, minY);
    const br = worldToScreen(maxX, maxY);
    ctx.strokeStyle = '#64748b';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y - 16);
    ctx.lineTo(br.x, tl.y - 16);
    ctx.moveTo(tl.x - 16, tl.y);
    ctx.lineTo(tl.x - 16, br.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const wMm = (maxX - minX).toFixed(1);
    const hMm = (maxY - minY).toFixed(1);
    ctx.fillText(`${wMm}mm`, (tl.x + br.x) / 2 - 15, tl.y - 20);
    ctx.save();
    ctx.translate(tl.x - 22, (tl.y + br.y) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${hMm}mm`, -15, 0);
    ctx.restore();
  }

  function drawTransformHandles(ctx: CanvasRenderingContext2D, shape: Shape) {
    const handles = getHandlePositions(shape, 1 / (MM_TO_PX * view.scale));
    const b = shapeBounds(shape);
    const topMid = worldToScreen((b.minX + b.maxX) / 2, b.maxY);
    const rotate = worldToScreen(handles.rotate.x, handles.rotate.y);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(topMid.x, topMid.y);
    ctx.lineTo(rotate.x, rotate.y);
    ctx.stroke();

    ctx.fillStyle = hoverHandle === 'rotate' ? '#f59e0b' : '#0a0e14';
    ctx.beginPath();
    ctx.arc(rotate.x, rotate.y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    for (const id of CORNER_HANDLES) {
      const p = worldToScreen(handles[id].x, handles[id].y);
      ctx.fillStyle = hoverHandle === id ? '#f59e0b' : '#0a0e14';
      ctx.fillRect(p.x - HANDLE_HALF, p.y - HANDLE_HALF, HANDLE_HALF * 2, HANDLE_HALF * 2);
      ctx.strokeRect(p.x - HANDLE_HALF, p.y - HANDLE_HALF, HANDLE_HALF * 2, HANDLE_HALF * 2);
    }
  }

  function findHandleAt(world: Point, shape: Shape): HandleId | null {
    const mmPerPx = 1 / (MM_TO_PX * view.scale);
    const handles = getHandlePositions(shape, mmPerPx);
    const tolerance = HANDLE_TOLERANCE_PX * mmPerPx;
    for (const id of [...CORNER_HANDLES, 'rotate'] as HandleId[]) {
      if (Math.hypot(world.x - handles[id].x, world.y - handles[id].y) <= tolerance) return id;
    }
    return null;
  }

  function startTransform(shape: Shape, handle: HandleId, world: Point) {
    beginEdit();
    const b = shapeBounds(shape);
    setTransformDrag({
      handle,
      shapeId: shape.id,
      original: shape,
      dimensions: shapes.filter((s): s is DimensionShape => s.type === 'dimension' && isDimensionAnchoredTo(s, shape.id)),
      pivot: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
      startRaw: world,
      startSnapped: snapPoint(world),
      baseRotation: shape.type === 'text' ? shape.rotation ?? 0 : 0,
    });
  }

  useEffect(() => {
    resizeCanvas();
  }, [resizeCanvas]);

  useEffect(() => {
    draw();
  });

  useEffect(() => {
    const handler = () => resizeCanvas();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [resizeCanvas]);

  function handleMouseDown(e: React.MouseEvent) {
    const world = screenToWorld(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setIsPanning(true);
      setDragStart({ x: e.clientX - view.offsetX, y: e.clientY - view.offsetY });
      return;
    }

    if (tool === 'select') {
      const selected = selectedShape && selectedShape.type !== 'dimension' ? selectedShape : null;
      const handle = selected ? findHandleAt(world, selected) : null;
      if (selected && handle) {
        startTransform(selected, handle, world);
        return;
      }

      let found: Shape | null = null;
      for (let i = shapes.length - 1; i >= 0; i--) {
        if (pointInShape(world, shapes[i])) {
          found = shapes[i];
          break;
        }
      }
      const modifier = e.ctrlKey || e.metaKey;
      if (!found) {
        if (!modifier) setSelectedIds([]);
        return;
      }
      if (modifier) {
        setSelectedIds(selectedIds.includes(found.id) ? selectedIds.filter((id) => id !== found.id) : [...selectedIds, found.id]);
        return;
      }
      if (!selectedIds.includes(found.id)) setSelectedIds([found.id]);
      beginEdit();
      setIsDragging(true);
      setDragOffset(snapPoint(world));
      return;
    }

    if (tool === 'trim' || tool === 'extend' || tool === 'chamfer') {
      const tolerance = 14 / (MM_TO_PX * view.scale);
      const next = tool === 'trim'
        ? trimLineAt(shapes, world, tolerance)
        : tool === 'extend'
          ? extendLineAt(shapes, world, tolerance)
          : chamferAt(shapes, world, tolerance);
      if (next) {
        beginEdit();
        setShapes(() => next);
        setSelectedIds([]);
        endEdit();
      }
      return;
    }

    const drawingPoint = snapPoint(world);

    if (tool === 'path') {
      setPathPoints((prev) => [...prev, drawingPoint]);
      return;
    }

    if (tool === 'text') {
      const text = window.prompt('Enter text:', 'CNC');
      if (text && text.trim()) {
        const newShape: Shape = {
          id: genId(),
          type: 'text',
          x: drawingPoint.x,
          y: drawingPoint.y,
          text: text.trim(),
          fontSize: 10,
          font: 'cnc-stroke',
          selected: false,
        } as Shape;
        setShapes((prev) => [...prev, newShape]);
        setSelectedIds([newShape.id]);
      }
      return;
    }

    if (tool === 'radius' || tool === 'diameter') {
      const mode = tool === 'radius' ? 'radius' : 'diameter';
      const circle = findCircleNear(shapes, world, 4 / (MM_TO_PX * view.scale));
      if (!circle) return;
      const dimension = {
        id: genId(),
        type: 'dimension',
        selected: false,
        ...circleDimensionEnds(circle, mode),
        targetId: circle.id,
        circleMode: mode,
      } as Shape;
      setShapes((prev) => [...prev, dimension]);
      setSelectedIds([dimension.id]);
      return;
    }

    setIsDrawing(true);
    setDragStart(drawingPoint);
  }

  function handleMouseMove(e: React.MouseEvent) {
    const world = screenToWorld(e.clientX, e.clientY);
    const snapping = tool !== 'select' || isDragging || !!transformDrag;
    const snappedWorld = snapping ? snapPoint(world) : world;
    setMousePos(snappedWorld);
    setSnapPreview(snapping && (snappedWorld.x !== world.x || snappedWorld.y !== world.y) ? snappedWorld : null);

    if (transformDrag) {
      const t = computeTransform(transformDrag, world, snappedWorld, snapToGrid);
      const next = transformShape(transformDrag.original, t);
      setShapesLive((prev) => prev.map((s) => {
        if (s.id === transformDrag.shapeId) return next;
        const dim = transformDrag.dimensions.find((d) => d.id === s.id);
        return dim ? transformDimensionAnchors(dim, transformDrag.shapeId, t) : s;
      }));
      return;
    }

    if (tool === 'select' && !isDragging && !isPanning) {
      setHoverHandle(selectedShape && selectedShape.type !== 'dimension' ? findHandleAt(world, selectedShape) : null);
    }

    if (isPanning && dragStart) {
      setView((v) => ({ ...v, offsetX: e.clientX - dragStart.x, offsetY: e.clientY - dragStart.y }));
      return;
    }

    if (isDragging && selectedIds.length > 0 && dragOffset) {
      const dx = snappedWorld.x - dragOffset.x;
      const dy = snappedWorld.y - dragOffset.y;
      setShapesLive((prev) => translateShapes(prev, selectedIds, dx, dy));
      setDragOffset(snappedWorld);
      return;
    }

    if (isDrawing && dragStart) {
      const endPt = snapPoint(world);
      const temp = createShape(tool, dragStart, endPt, { polygonSides, rectFromCenter });
      if (temp) setTempShape({ ...temp, id: 'temp', selected: false });
    }
  }

  function handleMouseUp(_e: React.MouseEvent) {
    if (transformDrag) {
      setTransformDrag(null);
      endEdit();
      return;
    }

    if (isPanning) {
      setIsPanning(false);
      setDragStart(null);
      return;
    }

    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      endEdit();
      return;
    }

    if (isDrawing && tempShape) {
      const newShape = { ...tempShape, id: genId(), selected: false } as Shape;
      if (newShape.type === 'dimension') {
        const startSnap = findNearestShapeEndpoint(shapes, { x: newShape.x1, y: newShape.y1 }, null, 3);
        const endSnap = findNearestShapeEndpoint(shapes, { x: newShape.x2, y: newShape.y2 }, null, 3);
        if (startSnap) {
          newShape.targetStartId = startSnap.shape.id;
          newShape.anchorStart = startSnap.point;
        }
        if (endSnap) {
          newShape.targetEndId = endSnap.shape.id;
          newShape.anchorEnd = endSnap.point;
        }
        if (startSnap && endSnap && startSnap.shape.id === endSnap.shape.id) {
          newShape.targetId = startSnap.shape.id;
        } else if (startSnap && !endSnap) {
          newShape.targetId = startSnap.shape.id;
        } else if (endSnap && !startSnap) {
          newShape.targetId = endSnap.shape.id;
        }
      }
      setShapes((prev) => [...prev, newShape]);
      setSelectedIds([newShape.id]);
      setTempShape(null);
    }

    setIsDrawing(false);
    setDragStart(null);
    setSnapPreview(null);
  }

  function handleDoubleClick() {
    if (tool === 'path' && pathPoints.length >= 2) {
      const newShape: Shape = {
        id: genId(),
        type: 'path',
        points: pathPoints,
        selected: false,
      };
      setShapes((prev) => [...prev, newShape]);
      setSelectedIds([newShape.id]);
      setPathPoints([]);
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(10, view.scale * delta));
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - view.offsetX) / (MM_TO_PX * view.scale);
    const rawWy = (my - view.offsetY) / (MM_TO_PX * view.scale);
    const wy = workspace.height - rawWy;
    setView({
      scale: newScale,
      offsetX: mx - wx * MM_TO_PX * newScale,
      offsetY: my - (workspace.height - wy) * MM_TO_PX * newScale,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedIds.length > 0 && tool === 'select') {
        setShapes((prev) => prev.filter((s) => !selectedIds.includes(s.id)));
        setSelectedIds([]);
      }
    }
    if (e.key === 'Escape') {
      setPathPoints([]);
      setSelectedIds([]);
      setTempShape(null);
      setSnapPreview(null);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#0a0e14]"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        style={{ cursor: tool === 'select' ? (hoverHandle ? HANDLE_CURSOR[hoverHandle] : 'default') : 'crosshair' }}
      />
      <div className="absolute bottom-3 left-3 flex items-center gap-3 text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-md border border-slate-700/50">
        <span>X: {mousePos.x.toFixed(1)}mm</span>
        <span>Y: {mousePos.y.toFixed(1)}mm</span>
        <span className="text-slate-600">|</span>
        <span>Zoom: {(view.scale * 100).toFixed(0)}%</span>
        {selectedShape && selectedShape.type !== 'dimension' && tool === 'select' && (
          <span className="text-slate-500">Drag corners to scale, top handle to rotate</span>
        )}
        {tool === 'path' && pathPoints.length > 0 && (
          <span className="text-amber-400">Points: {pathPoints.length} (double-click to finish)</span>
        )}
      </div>
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <button
          onClick={() => setView((v) => ({ ...v, scale: Math.min(10, v.scale * 1.2) }))}
          className="w-8 h-8 flex items-center justify-center bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
        >
          +
        </button>
        <button
          onClick={() => setView((v) => ({ ...v, scale: Math.max(0.1, v.scale * 0.8) }))}
          className="w-8 h-8 flex items-center justify-center bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
        >
          −
        </button>
        <button
          onClick={() => setView({ scale: 1, offsetX: 40, offsetY: 40 })}
          className="w-8 h-8 flex items-center justify-center bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs"
        >
          ⌂
        </button>
      </div>
      {selectedShape?.type === 'text' && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-700/50 shadow-xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Font</span>
          <select
            value={(selectedShape as any).font || 'cnc-stroke'}
            onChange={(e) => setShapes((prev) => prev.map((s) =>
              s.id === selectedShape.id ? { ...s, font: e.target.value } as Shape : s
            ))}
            className="bg-slate-800 text-slate-300 text-xs rounded px-2 py-1 border border-slate-700 focus:border-blue-500 focus:outline-none max-w-[140px]"
          >
            {getAllFonts().map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}{f.source === 'custom' ? ' (uploaded)' : ''}
              </option>
            ))}
          </select>
          <div className="w-px h-5 bg-slate-700" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Size</span>
          {[5, 8, 10, 15, 20, 30].map((sz) => (
            <button
              key={sz}
              onClick={() => setShapes((prev) => prev.map((s) =>
                s.id === selectedShape.id ? { ...s, fontSize: sz } as Shape : s
              ))}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                selectedShape.fontSize === sz
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {sz}mm
            </button>
          ))}
          <div className="w-px h-5 bg-slate-700" />
          <button
            onClick={() => {
              const newText = window.prompt('Edit text:', selectedShape.text);
              if (newText !== null && newText.trim()) {
                setShapes((prev) => prev.map((s) =>
                  s.id === selectedShape.id ? { ...s, text: newText.trim() } as Shape : s
                ));
              }
            }}
            className="px-2.5 py-1 text-[11px] bg-slate-800 text-slate-300 hover:bg-slate-700 rounded transition-colors"
          >
            Edit Text
          </button>
        </div>
      )}
      {selectedShape?.type === 'dimension' && (() => {
        const dim = selectedShape as any;
        const dx = dim.x2 - dim.x1;
        const dy = dim.y2 - dim.y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const isFromOrigin = Math.abs(dim.x1) < 0.01 && Math.abs(dim.y1) < 0.01;
        const target = dim.targetId ? shapes.find((s) => s.id === dim.targetId) : null;
        return (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-700/50 shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {dim.circleMode === 'radius' ? 'Radius' : dim.circleMode === 'diameter' ? 'Diameter' : isFromOrigin ? 'From Origin' : 'Dimension'}
            </span>
            <input
              type="number"
              step="0.1"
              defaultValue={dist.toFixed(1)}
              key={dist.toFixed(1)}
              className="w-20 bg-slate-800 text-slate-200 text-xs rounded px-2 py-1 border border-slate-700 focus:border-amber-500 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = parseFloat((e.target as HTMLInputElement).value);
                  if (isNaN(val) || val <= 0) return;
                  if (dim.circleMode && target?.type === 'circle') {
                    const circleId = target.id;
                    setShapes((prev) => applyCircleDimension(prev, circleId, dim.id, dim.circleMode, val));
                    (e.target as HTMLInputElement).blur();
                    return;
                  }
                  setShapes((prev) => {
                    const ratio = val / dist;
                    const nextTarget = target
                      ? resizeShapeByDimension(target, dim, val) as Shape
                      : null;
                    return prev.map((s) => {
                      if (target && s.id === target.id) return nextTarget as Shape;
                      if (s.id !== dim.id) return s;
                      return {
                        ...s,
                        x2: dim.x1 + dx * ratio,
                        y2: dim.y1 + dy * ratio,
                        anchorEnd: dim.anchorEnd ? { x: dim.x1 + dx * ratio, y: dim.y1 + dy * ratio } : undefined,
                      } as Shape;
                    });
                  });
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <span className="text-xs text-slate-400">mm</span>
            {target && (
              <span className="text-[10px] text-amber-400 ml-1">
                linked to {target.type}
              </span>
            )}
            {!target && (
              <button
                onClick={() => {
                  const candidates = shapes.filter((s) => s.type !== 'dimension');
                  const startSnap = candidates.length > 0
                    ? findNearestShapeEndpoint(candidates, { x: dim.x1, y: dim.y1 }, null, 5)
                    : null;
                  const endSnap = candidates.length > 0
                    ? findNearestShapeEndpoint(candidates, { x: dim.x2, y: dim.y2 }, null, 5)
                    : null;
                  const linked = startSnap?.shape || endSnap?.shape;
                  if (linked) {
                    setShapes((prev) => prev.map((s) =>
                      s.id === dim.id
                        ? {
                            ...s,
                            targetId: startSnap?.shape.id === endSnap?.shape.id ? linked.id : undefined,
                            targetStartId: startSnap?.shape.id,
                            targetEndId: endSnap?.shape.id,
                            anchorStart: startSnap?.point,
                            anchorEnd: endSnap?.point,
                          } as Shape
                        : s
                    ));
                  }
                }}
                className="px-2 py-1 text-[11px] bg-slate-800 text-slate-300 hover:bg-slate-700 rounded transition-colors"
              >
                Link to shape
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function getHandlePositions(shape: Shape, mmPerPx: number): Record<HandleId, Point> {
  const b = shapeBounds(shape);
  return {
    nw: { x: b.minX, y: b.maxY },
    ne: { x: b.maxX, y: b.maxY },
    se: { x: b.maxX, y: b.minY },
    sw: { x: b.minX, y: b.minY },
    rotate: { x: (b.minX + b.maxX) / 2, y: b.maxY + ROTATE_HANDLE_OFFSET_PX * mmPerPx },
  };
}

function computeTransform(drag: TransformDrag, raw: Point, snapped: Point, snapOn: boolean): Transform {
  if (drag.handle === 'rotate') {
    const startAngle = Math.atan2(drag.startRaw.y - drag.pivot.y, drag.startRaw.x - drag.pivot.x);
    const angle = Math.atan2(raw.y - drag.pivot.y, raw.x - drag.pivot.x);
    let total = drag.baseRotation + ((angle - startAngle) * 180) / Math.PI;
    if (snapOn) total = Math.round(total / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
    return { pivot: drag.pivot, scale: 1, rotation: total - drag.baseRotation };
  }
  const startDist = Math.hypot(drag.startSnapped.x - drag.pivot.x, drag.startSnapped.y - drag.pivot.y);
  const currentDist = Math.hypot(snapped.x - drag.pivot.x, snapped.y - drag.pivot.y);
  const scale = startDist < 0.01 ? 1 : Math.max(0.05, currentDist / startDist);
  return { pivot: drag.pivot, scale, rotation: 0 };
}

type DrawOptions = { polygonSides: number; rectFromCenter: boolean };

function regularPolygonPoints(center: Point, radius: number, angle: number, sides: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= sides; i++) {
    const a = angle + (2 * Math.PI * i) / sides;
    points.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return points;
}

function createShape(tool: ToolType, start: Point, end: Point, options: DrawOptions): Shape | null {
  const base = { id: 'temp', selected: false };
  switch (tool) {
    case 'rect': {
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      if (options.rectFromCenter) {
        return { ...base, type: 'rect', x: start.x - w, y: start.y - h, width: 2 * w, height: 2 * h };
      }
      return {
        ...base,
        type: 'rect',
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: w,
        height: h,
      };
    }
    case 'polygon': {
      const radius = Math.hypot(end.x - start.x, end.y - start.y);
      if (radius < 0.01) return null;
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      return {
        ...base,
        type: 'path',
        points: regularPolygonPoints(start, radius, angle, options.polygonSides),
      };
    }
    case 'circle': {
      const r = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
      return { ...base, type: 'circle', cx: start.x, cy: start.y, radius: r };
    }
    case 'line':
      return { ...base, type: 'line', x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    case 'dimension':
      return { ...base, type: 'dimension', x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    default:
      return null;
  }
}
