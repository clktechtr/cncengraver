import type { Point, Shape, RectShape, CircleShape, LineShape, TextShape, PathShape, DimensionShape } from '@/types';

export type Transform = { pivot: Point; scale: number; rotation: number };

export function transformPoint(p: Point, t: Transform): Point {
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = (p.x - t.pivot.x) * t.scale;
  const dy = (p.y - t.pivot.y) * t.scale;
  return { x: t.pivot.x + dx * cos - dy * sin, y: t.pivot.y + dx * sin + dy * cos };
}

function boundsOf(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function isRightAngle(deg: number): boolean {
  const q = deg / 90;
  return Math.abs(q - Math.round(q)) < 1e-9;
}

export function transformShape(shape: Shape, t: Transform): Shape {
  switch (shape.type) {
    case 'rect': {
      const s = shape as RectShape;
      const corners = [
        { x: s.x, y: s.y },
        { x: s.x + s.width, y: s.y },
        { x: s.x + s.width, y: s.y + s.height },
        { x: s.x, y: s.y + s.height },
      ].map((p) => transformPoint(p, t));
      if (isRightAngle(t.rotation)) {
        const b = boundsOf(corners);
        return { ...s, x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY };
      }
      const path: PathShape = {
        id: s.id,
        type: 'path',
        selected: s.selected,
        points: [...corners, corners[0]],
      };
      return path;
    }
    case 'circle': {
      const s = shape as CircleShape;
      const c = transformPoint({ x: s.cx, y: s.cy }, t);
      return { ...s, cx: c.x, cy: c.y, radius: s.radius * t.scale };
    }
    case 'line': {
      const s = shape as LineShape;
      const p1 = transformPoint({ x: s.x1, y: s.y1 }, t);
      const p2 = transformPoint({ x: s.x2, y: s.y2 }, t);
      return { ...s, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    case 'text': {
      const s = shape as TextShape;
      const a = transformPoint({ x: s.x, y: s.y }, t);
      const rotation = (((s.rotation ?? 0) + t.rotation) % 360 + 360) % 360;
      return { ...s, x: a.x, y: a.y, fontSize: s.fontSize * t.scale, rotation };
    }
    case 'path': {
      const s = shape as PathShape;
      return { ...s, points: s.points.map((p) => transformPoint(p, t)) };
    }
    case 'dimension':
      return shape;
  }
}

export function isDimensionAnchoredTo(dim: DimensionShape, shapeId: string): boolean {
  return dim.targetStartId === shapeId || dim.targetEndId === shapeId;
}

export function transformDimensionAnchors(dim: DimensionShape, shapeId: string, t: Transform): DimensionShape {
  let next = dim;
  if (dim.targetStartId === shapeId && dim.anchorStart) {
    const a = transformPoint(dim.anchorStart, t);
    next = { ...next, x1: a.x, y1: a.y, anchorStart: a };
  }
  if (dim.targetEndId === shapeId && dim.anchorEnd) {
    const a = transformPoint(dim.anchorEnd, t);
    next = { ...next, x2: a.x, y2: a.y, anchorEnd: a };
  }
  return next;
}

export function shapeBounds(shape: Shape) {
  switch (shape.type) {
    case 'rect': {
      const s = shape as RectShape;
      return { minX: s.x, minY: s.y, maxX: s.x + s.width, maxY: s.y + s.height };
    }
    case 'circle': {
      const s = shape as CircleShape;
      return { minX: s.cx - s.radius, minY: s.cy - s.radius, maxX: s.cx + s.radius, maxY: s.cy + s.radius };
    }
    case 'line': {
      const s = shape as LineShape;
      return { minX: Math.min(s.x1, s.x2), minY: Math.min(s.y1, s.y2), maxX: Math.max(s.x1, s.x2), maxY: Math.max(s.y1, s.y2) };
    }
    case 'text': {
      const s = shape as TextShape;
      const w = s.text.length * s.fontSize * 0.6;
      const pivot = { x: s.x, y: s.y };
      const corners = [
        { x: s.x, y: s.y - s.fontSize },
        { x: s.x + w, y: s.y - s.fontSize },
        { x: s.x + w, y: s.y },
        { x: s.x, y: s.y },
      ].map((p) => transformPoint(p, { pivot, scale: 1, rotation: s.rotation ?? 0 }));
      return boundsOf(corners);
    }
    case 'path': {
      const s = shape as PathShape;
      if (s.points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of s.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return { minX, minY, maxX, maxY };
    }
    case 'dimension': {
      const s = shape as DimensionShape;
      return { minX: Math.min(s.x1, s.x2), minY: Math.min(s.y1, s.y2), maxX: Math.max(s.x1, s.x2), maxY: Math.max(s.y1, s.y2) };
    }
  }
}

export function pointInShape(point: Point, shape: Shape): boolean {
  switch (shape.type) {
    case 'rect': {
      const s = shape as RectShape;
      return point.x >= s.x && point.x <= s.x + s.width && point.y >= s.y && point.y <= s.y + s.height;
    }
    case 'circle': {
      const s = shape as CircleShape;
      const dx = point.x - s.cx;
      const dy = point.y - s.cy;
      return Math.sqrt(dx * dx + dy * dy) <= s.radius;
    }
    case 'line': {
      const s = shape as LineShape;
      const dist = pointToSegmentDist(point, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      return dist < 2;
    }
    case 'text': {
      const s = shape as TextShape;
      const w = s.text.length * s.fontSize * 0.6;
      const local = transformPoint(point, { pivot: { x: s.x, y: s.y }, scale: 1, rotation: -(s.rotation ?? 0) });
      return local.x >= s.x && local.x <= s.x + w && local.y >= s.y - s.fontSize && local.y <= s.y;
    }
    case 'path': {
      const s = shape as PathShape;
      for (let i = 0; i < s.points.length - 1; i++) {
        const dist = pointToSegmentDist(point, s.points[i], s.points[i + 1]);
        if (dist < 2) return true;
      }
      return false;
    }
    case 'dimension': {
      const s = shape as DimensionShape;
      return pointToSegmentDist(point, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }) < 3;
    }
  }
}

export function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}

export function shapeToPathPoints(shape: Shape): Point[] {
  switch (shape.type) {
    case 'rect': {
      const s = shape as RectShape;
      return [
        { x: s.x, y: s.y },
        { x: s.x + s.width, y: s.y },
        { x: s.x + s.width, y: s.y + s.height },
        { x: s.x, y: s.y + s.height },
        { x: s.x, y: s.y },
      ];
    }
    case 'circle': {
      const s = shape as CircleShape;
      const pts: Point[] = [];
      const segments = 64;
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        pts.push({ x: s.cx + Math.cos(angle) * s.radius, y: s.cy + Math.sin(angle) * s.radius });
      }
      return pts;
    }
    case 'line': {
      const s = shape as LineShape;
      return [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
    }
    case 'text': {
      const s = shape as TextShape;
      return [{ x: s.x, y: s.y }];
    }
    case 'path': {
      const s = shape as PathShape;
      return s.points;
    }
    case 'dimension': {
      const s = shape as DimensionShape;
      return [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
    }
  }
}

export function offsetPath(points: Point[], offset: number): Point[] {
  if (points.length < 2 || offset === 0) return points;
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const curr = points[i];
    const next = points[Math.min(points.length - 1, i + 1)];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;

    const nx1 = -dy1 / len1;
    const ny1 = dx1 / len1;
    const nx2 = -dy2 / len2;
    const ny2 = dx2 / len2;

    const nx = (nx1 + nx2) / 2;
    const ny = (ny1 + ny2) / 2;

    result.push({ x: curr.x + nx * offset, y: curr.y + ny * offset });
  }
  return result;
}

export function moveShape(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.type) {
    case 'rect':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'circle':
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    case 'line':
      return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
    case 'text':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'path':
      return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'dimension':
      return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
  }
}

export function translateShapes(shapes: Shape[], ids: string[], dx: number, dy: number): Shape[] {
  const idSet = new Set(ids);
  return shapes.map((s) => {
    if (idSet.has(s.id)) return moveShape(s, dx, dy);
    if (s.type === 'dimension') return translateDimensionAnchors(s, idSet, dx, dy);
    return s;
  });
}

function translateDimensionAnchors(dim: DimensionShape, ids: Set<string>, dx: number, dy: number): DimensionShape {
  const linked = (id?: string) => id !== undefined && ids.has(id);
  const hasStart = linked(dim.targetStartId) || (!dim.targetStartId && linked(dim.targetId) && !!dim.anchorStart);
  const hasEnd = linked(dim.targetEndId) || (!dim.targetEndId && linked(dim.targetId) && !!dim.anchorEnd);
  const legacy = !dim.targetStartId && !dim.targetEndId && linked(dim.targetId) && !dim.anchorStart && !dim.anchorEnd;
  if (!hasStart && !hasEnd && !legacy) return dim;
  return {
    ...dim,
    x1: hasStart || legacy ? dim.x1 + dx : dim.x1,
    y1: hasStart || legacy ? dim.y1 + dy : dim.y1,
    x2: hasEnd || legacy ? dim.x2 + dx : dim.x2,
    y2: hasEnd || legacy ? dim.y2 + dy : dim.y2,
    anchorStart: hasStart && dim.anchorStart ? { x: dim.anchorStart.x + dx, y: dim.anchorStart.y + dy } : dim.anchorStart,
    anchorEnd: hasEnd && dim.anchorEnd ? { x: dim.anchorEnd.x + dx, y: dim.anchorEnd.y + dy } : dim.anchorEnd,
  };
}

export function selectionCenter(shapes: Shape[]): Point {
  if (shapes.length === 0) return { x: 0, y: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    const b = shapeBounds(s);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function genId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function resizeShapeByDimension(
  shape: Shape,
  dimension: DimensionShape,
  newDistance: number,
): Shape {
  const dx = dimension.x2 - dimension.x1;
  const dy = dimension.y2 - dimension.y1;
  const currentDist = Math.sqrt(dx * dx + dy * dy);
  if (currentDist < 0.001) return shape;

  const scale = newDistance / currentDist;
  const anchor = dimension.anchorEnd ?? dimension.anchorStart ?? { x: dimension.x1, y: dimension.y1 };
  const fixedPoint = dimension.anchorEnd ? { x: dimension.x1, y: dimension.y1 } : anchor;

  const scalePoint = (point: Point): Point => ({
    x: fixedPoint.x + (point.x - fixedPoint.x) * scale,
    y: fixedPoint.y + (point.y - fixedPoint.y) * scale,
  });

  switch (shape.type) {
    case 'rect': {
      const s = shape as RectShape;
      const topLeft = scalePoint({ x: s.x, y: s.y });
      const bottomRight = scalePoint({ x: s.x + s.width, y: s.y + s.height });
      return {
        ...s,
        x: Math.min(topLeft.x, bottomRight.x),
        y: Math.min(topLeft.y, bottomRight.y),
        width: Math.abs(bottomRight.x - topLeft.x),
        height: Math.abs(bottomRight.y - topLeft.y),
      };
    }
    case 'circle': {
      const s = shape as CircleShape;
      return { ...s, radius: s.radius * Math.abs(scale) };
    }
    case 'line': {
      const s = shape as LineShape;
      const p1 = scalePoint({ x: s.x1, y: s.y1 });
      const p2 = scalePoint({ x: s.x2, y: s.y2 });
      return { ...s, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    case 'path': {
      const s = shape as PathShape;
      return { ...s, points: s.points.map(scalePoint) };
    }
    default:
      return shape;
  }
}

export function circleDimensionEnds(circle: CircleShape, mode: 'radius' | 'diameter'): { x1: number; y1: number; x2: number; y2: number } {
  const r = circle.radius;
  return mode === 'radius'
    ? { x1: circle.cx, y1: circle.cy, x2: circle.cx + r, y2: circle.cy }
    : { x1: circle.cx - r, y1: circle.cy, x2: circle.cx + r, y2: circle.cy };
}

export function findCircleNear(shapes: Shape[], point: Point, tolerance: number): CircleShape | null {
  let best: CircleShape | null = null;
  let bestScore = Infinity;
  for (const s of shapes) {
    if (s.type !== 'circle') continue;
    const dist = Math.hypot(point.x - s.cx, point.y - s.cy);
    const edgeGap = Math.abs(dist - s.radius);
    if (edgeGap <= tolerance) {
      if (edgeGap < bestScore) {
        best = s;
        bestScore = edgeGap;
      }
    } else if (dist <= s.radius) {
      if (s.radius < bestScore) {
        best = s;
        bestScore = s.radius;
      }
    }
  }
  return best;
}

export function applyCircleDimension(
  shapes: Shape[],
  circleId: string,
  dimId: string,
  mode: 'radius' | 'diameter',
  value: number,
): Shape[] {
  const circle = shapes.find((s) => s.id === circleId);
  if (!circle || circle.type !== 'circle') return shapes;
  const radius = mode === 'radius' ? value : value / 2;
  const resized: CircleShape = { ...circle, radius };
  return shapes.map((s) => {
    if (s.id === circleId) return resized;
    if (s.id === dimId) return { ...s, ...circleDimensionEnds(resized, mode) };
    return s;
  });
}

export function findNearestShapeEndpoint(
  shapes: Shape[],
  point: Point,
  excludeId: string | null,
  threshold: number = 5,
): { shape: Shape; point: Point } | null {
  let best: { shape: Shape; point: Point; dist: number } | null = null;

  for (const shape of shapes) {
    if (shape.type === 'dimension' || shape.id === excludeId) continue;
    const endpoints = getShapeEndpoints(shape);
    for (const ep of endpoints) {
      const d = Math.sqrt((ep.x - point.x) ** 2 + (ep.y - point.y) ** 2);
      if (d < threshold && (!best || d < best.dist)) {
        best = { shape, point: ep, dist: d };
      }
    }
  }

  return best ? { shape: best.shape, point: best.point } : null;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function boundsPoints(shape: Shape): Point[] {
  const b = shapeBounds(shape);
  return [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
    { x: (b.minX + b.maxX) / 2, y: b.minY },
    { x: (b.minX + b.maxX) / 2, y: b.maxY },
    { x: b.minX, y: (b.minY + b.maxY) / 2 },
    { x: b.maxX, y: (b.minY + b.maxY) / 2 },
  ];
}

export function getShapeEndpoints(shape: Shape): Point[] {
  switch (shape.type) {
    case 'line': {
      const a = { x: shape.x1, y: shape.y1 };
      const b = { x: shape.x2, y: shape.y2 };
      return [a, b, midpoint(a, b)];
    }
    case 'path': {
      const pts = shape.points;
      return [...pts, ...pts.slice(1).map((p, i) => midpoint(pts[i], p))];
    }
    case 'circle':
      return [
        { x: shape.cx, y: shape.cy },
        { x: shape.cx + shape.radius, y: shape.cy },
        { x: shape.cx - shape.radius, y: shape.cy },
        { x: shape.cx, y: shape.cy + shape.radius },
        { x: shape.cx, y: shape.cy - shape.radius },
      ];
    case 'rect':
      return [...boundsPoints(shape), { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }];
    default:
      return boundsPoints(shape);
  }
}

