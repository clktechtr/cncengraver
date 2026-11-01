import type { DimensionShape, Shape } from '@/types';
import {
  isDimensionAnchoredTo,
  selectionCenter,
  transformDimensionAnchors,
  transformShape,
} from '@/lib/geometry';

export function scaleSelection(shapes: Shape[], ids: string[], percent: number): Shape[] {
  const selected = shapes.filter((s) => ids.includes(s.id) && s.type !== 'dimension');
  const t = { pivot: selectionCenter(selected), scale: percent / 100, rotation: 0 };

  return shapes.map((s) => {
    if (s.type === 'dimension') {
      let dim: DimensionShape = s;
      for (const id of ids) {
        if (isDimensionAnchoredTo(dim, id)) dim = transformDimensionAnchors(dim, id, t);
      }
      return dim;
    }
    return ids.includes(s.id) ? transformShape(s, t) : s;
  });
}
