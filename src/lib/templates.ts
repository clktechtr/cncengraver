import type { Shape, Point } from '@/types';

function shape(id: string, type: string, data: Record<string, any>): Shape {
  return { id, type, selected: false, ...data } as unknown as Shape;
}

function star(cx: number, cy: number, outerR: number, innerR: number, points: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  pts.push(pts[0]);
  return pts;
}

function gear(cx: number, cy: number, outerR: number, innerR: number, teeth: number): Point[] {
  const pts: Point[] = [];
  const stepAngle = (Math.PI * 2) / (teeth * 4);
  for (let i = 0; i < teeth * 4; i++) {
    const angle = i * stepAngle - Math.PI / 2;
    const r = (i % 4 === 0 || i % 4 === 1) ? outerR : innerR;
    pts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  pts.push(pts[0]);
  return pts;
}

function heart(cx: number, cy: number, size: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push({ x: cx + (x / 16) * size, y: cy + (y / 16) * size });
  }
  return pts;
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): Point[] {
  return [
    { x: x + r, y },
    { x: x + w - r, y },
    { x: x + w, y: y + r },
    { x: x + w, y: y + h - r },
    { x: x + w - r, y: y + h },
    { x: x + r, y: y + h },
    { x, y: y + h - r },
    { x, y: y + r },
    { x: x + r, y },
  ];
}

export type TemplateDef = {
  id: string;
  name: string;
  create: (originX: number, originY: number) => Shape[];
};

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'star-5',
    name: '5-Point Star',
    create: (ox, oy) => [
      shape('t', 'path', { points: star(ox + 25, oy + 25, 25, 10, 5) }),
    ],
  },
  {
    id: 'star-6',
    name: '6-Point Star',
    create: (ox, oy) => [
      shape('t', 'path', { points: star(ox + 25, oy + 25, 25, 12, 6) }),
    ],
  },
  {
    id: 'gear-12',
    name: 'Gear (12 teeth)',
    create: (ox, oy) => [
      shape('t', 'path', { points: gear(ox + 30, oy + 30, 30, 24, 12) }),
      shape('t2', 'circle', { cx: ox + 30, cy: oy + 30, radius: 8 }),
    ],
  },
  {
    id: 'heart',
    name: 'Heart',
    create: (ox, oy) => [
      shape('t', 'path', { points: heart(ox + 25, oy + 25, 25) }),
    ],
  },
  {
    id: 'rounded-rect',
    name: 'Rounded Rectangle',
    create: (ox, oy) => [
      shape('t', 'path', { points: roundedRect(ox, oy, 60, 40, 8) }),
    ],
  },
  {
    id: 'bracket-l',
    name: 'L Bracket',
    create: (ox, oy) => [
      shape('t', 'path', { points: [
        { x: ox, y: oy },
        { x: ox + 40, y: oy },
        { x: ox + 40, y: oy + 8 },
        { x: ox + 8, y: oy + 8 },
        { x: ox + 8, y: oy + 40 },
        { x: ox, y: oy + 40 },
        { x: ox, y: oy },
      ] }),
      shape('t2', 'circle', { cx: ox + 4, cy: oy + 4, radius: 1.5 }),
      shape('t3', 'circle', { cx: ox + 4, cy: oy + 36, radius: 1.5 }),
      shape('t4', 'circle', { cx: ox + 36, cy: oy + 4, radius: 1.5 }),
    ],
  },
  {
    id: 'nameplate',
    name: 'Nameplate',
    create: (ox, oy) => [
      shape('t', 'path', { points: roundedRect(ox, oy, 80, 25, 4) }),
      shape('t2', 'circle', { cx: ox + 5, cy: oy + 5, radius: 1.5 }),
      shape('t3', 'circle', { cx: ox + 75, cy: oy + 5, radius: 1.5 }),
      shape('t4', 'circle', { cx: ox + 5, cy: oy + 20, radius: 1.5 }),
      shape('t5', 'circle', { cx: ox + 75, cy: oy + 20, radius: 1.5 }),
    ],
  },
  {
    id: 'circle-grid',
    name: 'Hole Array (3x3)',
    create: (ox, oy) => {
      const shapes: Shape[] = [];
      const spacing = 15;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          shapes.push(shape(`h${r}${c}`, 'circle', {
            cx: ox + c * spacing + 5,
            cy: oy + r * spacing + 5,
            radius: 3,
          }));
        }
      }
      return shapes;
    },
  },
  {
    id: 'triangle',
    name: 'Triangle',
    create: (ox, oy) => [
      shape('t', 'path', { points: [
        { x: ox + 30, y: oy },
        { x: ox, y: oy + 50 },
        { x: ox + 60, y: oy + 50 },
        { x: ox + 30, y: oy },
      ] }),
    ],
  },
  {
    id: 'arrow',
    name: 'Arrow',
    create: (ox, oy) => [
      shape('t', 'path', { points: [
        { x: ox, y: oy + 10 },
        { x: ox + 35, y: oy + 10 },
        { x: ox + 35, y: oy },
        { x: ox + 60, y: oy + 15 },
        { x: ox + 35, y: oy + 30 },
        { x: ox + 35, y: oy + 20 },
        { x: ox, y: oy + 20 },
        { x: ox, y: oy + 10 },
      ] }),
    ],
  },
];
