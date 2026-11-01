import type { Shape } from '@/types';
import { shapeBounds, translateShapes } from '@/lib/geometry';

export type AlignMode = 'left' | 'centerX' | 'right';
export type DistributeAxis = 'horizontal' | 'vertical';

type Offset = { id: string; dx: number; dy: number };

function applyOffsets(shapes: Shape[], offsets: Offset[]): Shape[] {
  return offsets.reduce((acc, o) => translateShapes(acc, [o.id], o.dx, o.dy), shapes);
}

export function alignShapes(shapes: Shape[], ids: string[], mode: AlignMode): Shape[] {
  const selected = shapes.filter((s) => ids.includes(s.id));
  if (selected.length < 2) return shapes;

  const boxes = selected.map((s) => ({ id: s.id, b: shapeBounds(s) }));
  const minX = Math.min(...boxes.map(({ b }) => b.minX));
  const maxX = Math.max(...boxes.map(({ b }) => b.maxX));
  const centerX = (minX + maxX) / 2;

  const offsets: Offset[] = boxes.map(({ id, b }) => {
    let dx = 0;
    if (mode === 'left') dx = minX - b.minX;
    else if (mode === 'right') dx = maxX - b.maxX;
    else dx = centerX - (b.minX + b.maxX) / 2;
    return { id, dx, dy: 0 };
  });

  return applyOffsets(shapes, offsets);
}

export function distributeShapes(shapes: Shape[], ids: string[], axis: DistributeAxis): Shape[] {
  const selected = shapes.filter((s) => ids.includes(s.id));
  if (selected.length < 3) return shapes;

  const horizontal = axis === 'horizontal';
  const items = selected
    .map((s) => {
      const b = shapeBounds(s);
      return horizontal
        ? { id: s.id, start: b.minX, size: b.maxX - b.minX }
        : { id: s.id, start: b.minY, size: b.maxY - b.minY };
    })
    .sort((a, b) => a.start - b.start);

  const first = items[0];
  const rangeEnd = Math.max(...items.map((i) => i.start + i.size));
  const totalSize = items.reduce((sum, i) => sum + i.size, 0);
  const gap = (rangeEnd - first.start - totalSize) / (items.length - 1);

  let cursor = first.start;
  const offsets: Offset[] = items.map((item) => {
    const delta = cursor - item.start;
    cursor += item.size + gap;
    return horizontal ? { id: item.id, dx: delta, dy: 0 } : { id: item.id, dx: 0, dy: delta };
  });

  return applyOffsets(shapes, offsets);
}
