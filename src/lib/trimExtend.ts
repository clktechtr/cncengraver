import type { LineShape, Point, Shape } from '@/types';
import { genId, pointToSegmentDist } from '@/lib/geometry';

const EPS = 1e-6;

type SegmentHit = { t: number; u: number };

function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): SegmentHit | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const qx = b1.x - a1.x;
  const qy = b1.y - a1.y;
  return { t: (qx * sy - qy * sx) / denom, u: (qx * ry - qy * rx) / denom };
}

function lineEnds(line: LineShape): [Point, Point] {
  return [{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }];
}

function findLineNear(shapes: Shape[], point: Point, tolerance: number): LineShape | null {
  let best: LineShape | null = null;
  let bestDist = tolerance;
  for (const s of shapes) {
    if (s.type !== 'line') continue;
    const [a, b] = lineEnds(s);
    const d = pointToSegmentDist(point, a, b);
    if (d <= bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

function otherLines(shapes: Shape[], excludeId: string): LineShape[] {
  return shapes.filter((s): s is LineShape => s.type === 'line' && s.id !== excludeId);
}

export function trimLineAt(shapes: Shape[], point: Point, tolerance: number): Shape[] | null {
  const target = findLineNear(shapes, point, tolerance);
  if (!target) return null;
  const [a, b] = lineEnds(target);
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const len2 = rx * rx + ry * ry;
  if (len2 < EPS) return null;

  const clickT = ((point.x - a.x) * rx + (point.y - a.y) * ry) / len2;
  const cuts: number[] = [];
  for (const other of otherLines(shapes, target.id)) {
    const hit = segmentIntersection(a, b, { x: other.x1, y: other.y1 }, { x: other.x2, y: other.y2 });
    if (hit && hit.t > EPS && hit.t < 1 - EPS && hit.u >= -EPS && hit.u <= 1 + EPS) cuts.push(hit.t);
  }
  if (cuts.length === 0) {
    if (clickT <= EPS || clickT >= 1 - EPS) return null;
    const keepStart = clickT > 0.5;
    const trimmed: LineShape = keepStart
      ? { ...target, x1: a.x, y1: a.y, x2: a.x + rx * clickT, y2: a.y + ry * clickT }
      : { ...target, x1: a.x + rx * clickT, y1: a.y + ry * clickT, x2: b.x, y2: b.y };
    return shapes.map((s) => (s.id === target.id ? trimmed : s));
  }

  const before = cuts.filter((t) => t < clickT);
  const after = cuts.filter((t) => t > clickT);
  const keep: Array<[number, number]> = [];
  if (before.length > 0) keep.push([0, Math.max(...before)]);
  if (after.length > 0) keep.push([Math.min(...after), 1]);

  const replacements: LineShape[] = keep.map(([t0, t1], i) => ({
    id: i === 0 ? target.id : genId(),
    type: 'line',
    selected: false,
    x1: a.x + rx * t0,
    y1: a.y + ry * t0,
    x2: a.x + rx * t1,
    y2: a.y + ry * t1,
  }));

  return shapes.flatMap((s) => (s.id === target.id ? replacements : [s]));
}

export function chamferAt(shapes: Shape[], point: Point, tolerance: number, distance = 5): Shape[] | null {
  const lines = otherLines(shapes, '');
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const first = lines[i];
      const second = lines[j];
      const firstEnds = lineEnds(first);
      const secondEnds = lineEnds(second);
      for (const corner of firstEnds) {
        const secondCorner = secondEnds.find((candidate) => Math.hypot(candidate.x - corner.x, candidate.y - corner.y) <= tolerance);
        if (!secondCorner || Math.hypot(point.x - corner.x, point.y - corner.y) > tolerance * 2) continue;
        const firstOther = firstEnds[0] === corner ? firstEnds[1] : firstEnds[0];
        const secondOther = secondEnds[0] === secondCorner ? secondEnds[1] : secondEnds[0];
        const firstLength = Math.hypot(firstOther.x - corner.x, firstOther.y - corner.y);
        const secondLength = Math.hypot(secondOther.x - secondCorner.x, secondOther.y - secondCorner.y);
        if (firstLength < distance || secondLength < distance) return null;
        const firstCut = { x: corner.x + (firstOther.x - corner.x) * distance / firstLength, y: corner.y + (firstOther.y - corner.y) * distance / firstLength };
        const secondCut = { x: secondCorner.x + (secondOther.x - secondCorner.x) * distance / secondLength, y: secondCorner.y + (secondOther.y - secondCorner.y) * distance / secondLength };
        const nextFirst = firstEnds[0] === corner ? { ...first, x1: firstCut.x, y1: firstCut.y } : { ...first, x2: firstCut.x, y2: firstCut.y };
        const nextSecond = secondEnds[0] === secondCorner ? { ...second, x1: secondCut.x, y1: secondCut.y } : { ...second, x2: secondCut.x, y2: secondCut.y };
        const chamfer: LineShape = { id: genId(), type: 'line', selected: false, x1: firstCut.x, y1: firstCut.y, x2: secondCut.x, y2: secondCut.y };
        return shapes.map((shape) => shape.id === first.id ? nextFirst : shape.id === second.id ? nextSecond : shape).concat(chamfer);
      }
    }
  }
  return null;
}

export function extendLineAt(shapes: Shape[], point: Point, tolerance: number): Shape[] | null {
  let best: { line: LineShape; movingEnd: 1 | 2; dist: number } | null = null;
  for (const s of shapes) {
    if (s.type !== 'line') continue;
    const ends: Array<[1 | 2, Point]> = [[1, { x: s.x1, y: s.y1 }], [2, { x: s.x2, y: s.y2 }]];
    for (const [movingEnd, p] of ends) {
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d <= tolerance && (!best || d < best.dist)) best = { line: s, movingEnd, dist: d };
    }
  }
  if (!best) return null;

  const { line, movingEnd } = best;
  const [start, end] = lineEnds(line);
  const fixed = movingEnd === 1 ? end : start;
  const moving = movingEnd === 1 ? start : end;
  if (Math.hypot(moving.x - fixed.x, moving.y - fixed.y) < EPS) return null;

  let bestT = Infinity;
  for (const other of otherLines(shapes, line.id)) {
    const hit = segmentIntersection(fixed, moving, { x: other.x1, y: other.y1 }, { x: other.x2, y: other.y2 });
    if (hit && hit.t > 1 + EPS && hit.u >= -EPS && hit.u <= 1 + EPS && hit.t < bestT) bestT = hit.t;
  }
  if (bestT === Infinity) return null;

  const newX = fixed.x + (moving.x - fixed.x) * bestT;
  const newY = fixed.y + (moving.y - fixed.y) * bestT;
  return shapes.map((s) => {
    if (s.id !== line.id || s.type !== 'line') return s;
    return movingEnd === 1 ? { ...s, x1: newX, y1: newY } : { ...s, x2: newX, y2: newY };
  });
}
