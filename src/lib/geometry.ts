import type { Point, Shape, RectShape, CircleShape, LineShape, TextShape, PathShape, DimensionShape } from '@/types';

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
      return { minX: s.x, minY: s.y - s.fontSize, maxX: s.x + w, maxY: s.y };
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
      return point.x >= s.x && point.x <= s.x + w && point.y >= s.y - s.fontSize && point.y <= s.y;
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

function pointToSegmentDist(p: Point, a: Point, b: Point): number {
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

export function getShapeEndpoints(shape: Shape): Point[] {
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
