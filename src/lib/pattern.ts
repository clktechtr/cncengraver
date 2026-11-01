import type { Point, Shape } from '@/types';
import { genId, moveShape, transformShape } from '@/lib/geometry';

export type PatternSettings =
  | { kind: 'linear'; count: number; dx: number; dy: number }
  | { kind: 'circular'; count: number; center: Point; totalAngle: number };

export function patternCopies(shapes: Shape[], settings: PatternSettings): Shape[] {
  const sources = shapes.filter((s) => s.type !== 'dimension');
  const copies: Shape[] = [];
  const angleStep = settings.kind === 'circular'
    ? (Math.abs(settings.totalAngle) >= 360 ? settings.totalAngle / settings.count : settings.totalAngle / (settings.count - 1))
    : 0;

  for (let k = 1; k < settings.count; k++) {
    for (const s of sources) {
      const moved = settings.kind === 'linear'
        ? moveShape(s, k * settings.dx, k * settings.dy)
        : transformShape(s, { pivot: settings.center, scale: 1, rotation: k * angleStep });
      copies.push({ ...moved, id: genId(), selected: false });
    }
  }
  return copies;
}
